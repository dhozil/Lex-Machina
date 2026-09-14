# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"


def _as_addr(value):
    if isinstance(value, Address):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        # Studio's web form serializes addresses as integers; the runner's
        # Address(int) overflows on them, so convert via fixed-width bytes.
        if value < 0 or value >= 1 << 160:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Invalid address integer")
        return Address(value.to_bytes(20, "big"))
    return Address(value)


class ProtocolVault(gl.Contract):
    """A governed protocol. The Governor can pause/unpause it and reads its
    live state to decide whether the protocol is healthy or exploited."""

    owner: Address
    governor: Address
    paused: bool
    total_deposits: u256
    deposit_count: u256
    last_activity: u256
    deposits: TreeMap[Address, u256]

    def __init__(self, governor: Address, seed_deposit: u256):
        self.owner = gl.message.sender_address
        self.governor = _as_addr(governor)
        self.paused = False
        self.total_deposits = 0
        self.deposit_count = 0
        self.last_activity = 0
        if seed_deposit > 0:
            self.deposits[gl.message.sender_address] = seed_deposit
            self.total_deposits = seed_deposit
            self.deposit_count = 1
            self.last_activity = seed_deposit

    @gl.public.view
    def is_paused(self) -> bool:
        return self.paused

    @gl.public.view
    def get_state(self) -> dict:
        return {
            "paused": self.paused,
            "total_deposits": self.total_deposits,
            "deposit_count": self.deposit_count,
            "last_activity": self.last_activity,
            "governor": str(self.governor),
        }

    @gl.public.view
    def balance_of(self, holder: Address) -> u256:
        try:
            return self.deposits[_as_addr(holder)]
        except KeyError:
            return 0

    @gl.public.write
    def pause(self) -> None:
        if gl.message.sender_address != self.governor:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only governor can pause")
        self.paused = True

    @gl.public.write
    def unpause(self) -> None:
        if gl.message.sender_address != self.governor:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only governor can unpause")
        self.paused = False

    @gl.public.write
    def deposit(self, amount: u256) -> None:
        if self.paused:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Protocol is paused")
        if amount == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Amount must be positive")
        try:
            current = self.deposits[gl.message.sender_address]
        except KeyError:
            current = 0
        self.deposits[gl.message.sender_address] = current + amount
        self.total_deposits += amount
        self.deposit_count += 1
        self.last_activity += amount

    @gl.public.write
    def withdraw(self, amount: u256) -> None:
        if self.paused:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Protocol is paused")
        try:
            current = self.deposits[gl.message.sender_address]
        except KeyError:
            current = 0
        if current < amount:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient balance")
        self.deposits[gl.message.sender_address] = current - amount
        self.total_deposits -= amount
        self.last_activity += amount

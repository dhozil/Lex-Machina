"""Integration tests for the Self-Governing Protocol (Governor + ProtocolVault).

Runs against a local GLSim network (localnet) with mocked LLM responses so the
verifiable-adjudication and auto-tuning flows can be exercised deterministically.
"""

import json
import os
import subprocess
import time

import pytest
import requests

from gltest import get_contract_factory
from gltest.clients import get_gl_client
from gltest.assertions import tx_execution_succeeded
from gltest.utils import extract_contract_address
from gltest.accounts import get_default_account
from genlayer_py.types import TransactionStatus

GLSIM_HOST = "http://127.0.0.1:4000"


def _start_glsim():
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        ["glsim", "--port", "4000", "--validators", "5", "--no-browser"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    for _ in range(60):
        try:
            if requests.get(f"{GLSIM_HOST}/health", timeout=2).ok:
                return proc
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("GLSim did not become healthy")


@pytest.fixture(scope="session", autouse=True)
def glsim():
    proc = _start_glsim()
    yield proc
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def llm_mocks():
    responses = {
        "ACTIVE exploit": json.dumps(
            {"exploit": True, "confidence": 92, "reasoning": "evidence confirms active exploit"}
        ),
        "SAFE to resume": json.dumps(
            {"safe": True, "confidence": 91, "reasoning": "no exploit remains"}
        ),
        "governance engine": json.dumps(
            {"action": "tighten", "new_risk_threshold": 100, "reasoning": "activity is risky"}
        ),
        "review board": json.dumps(
            {"score": 85, "listed": True, "reasoning": "complete profile, sane rules"}
        ),
    }
    return {
        "validators": [
            {
                "plugin_config": {
                    "mock_response": {"response": responses},
                }
            }
        ]
    }


def _deploy(name, args):
    factory = get_contract_factory(name)
    receipt = factory.deploy_contract_tx(args=args)
    assert tx_execution_succeeded(receipt)
    return extract_contract_address(receipt)


def _write(addr, method, args, wait_triggered=False, sim_config=None):
    client = get_gl_client()
    tx = client.write_contract(
        address=addr,
        function_name=method,
        account=get_default_account(),
        args=args,
        sim_config=sim_config,
    )
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx, status=TransactionStatus.ACCEPTED
    )
    assert tx_execution_succeeded(receipt)
    if wait_triggered:
        for tr in receipt.get("triggered_transactions", []):
            client.wait_for_transaction_receipt(
                transaction_hash=tr, status=TransactionStatus.ACCEPTED
            )
    return receipt


def _read(addr, method, args):
    return get_gl_client().read_contract(
        address=addr,
        function_name=method,
        account=get_default_account(),
        args=args,
    )


def _write_raw(addr, method, args, account=None, sim_config=None):
    client = get_gl_client()
    tx = client.write_contract(
        address=addr,
        function_name=method,
        account=account or get_default_account(),
        args=args,
        sim_config=sim_config,
    )
    return client.wait_for_transaction_receipt(
        transaction_hash=tx, status=TransactionStatus.ACCEPTED
    )


@pytest.fixture(scope="session")
def governor(llm_mocks):
    return _deploy("Governor", ["Rule 1: no unauthorized withdrawals.", 50])


@pytest.fixture(scope="session")
def vault(governor):
    return _deploy("ProtocolVault", [governor, 1000])


def test_deploy_and_register(governor, vault):
    # NOTE: gltest/GLSim only supports deploying each contract file ONCE per
    # session, so the suite registers this single vault through the full
    # listing lifecycle instead of deploying extra vaults.
    _write(governor, "request_listing", [vault, "Vault-1", "First reference vault"])

    pending = _read(governor, "get_listing_requests", [])
    assert len(pending) == 1
    assert pending[0]["address"].lower() == vault.lower()
    assert pending[0]["label"] == "Vault-1"
    assert pending[0]["description"] == "First reference vault"
    assert pending[0]["status"] == "pending"

    # Duplicate requests must revert.
    assert not tx_execution_succeeded(
        _write_raw(governor, "request_listing", [vault, "Vault-1", "dup"])
    )

    # The requester can cancel their own request.
    _write(governor, "cancel_listing", [vault])
    assert _read(governor, "get_listing_requests", []) == []

    # Approving without a pending request must revert.
    assert not tx_execution_succeeded(_write_raw(governor, "approve_listing", [vault]))

    _write(governor, "request_listing", [vault, "Vault-1", "First reference vault"])
    _write(governor, "reject_listing", [vault])
    assert _read(governor, "get_listing_requests", []) == []

    _write(governor, "request_listing", [vault, "Vault-1", "First reference vault"])
    _write(governor, "approve_listing", [vault])

    assert _read(governor, "get_listing_requests", []) == []
    assert _read(governor, "get_protocol_label", [vault]) == "Vault-1"
    assert _read(governor, "get_protocol_description", [vault]) == "First reference vault"

    gstate = _read(governor, "get_governance_state", [])
    assert gstate["protocol_count"] == 1

    state = _read(governor, "get_protocol_state", [vault])
    assert state["paused"] is False
    assert state["total_deposits"] == 1000


def test_listing_rejects_incompatible_protocol(governor, curator):
    from gltest.accounts import create_account

    # The curator has no get_state() view, so it cannot be listed.
    assert not tx_execution_succeeded(
        _write_raw(governor, "request_listing", [curator, "Curator", "Not a protocol"])
    )
    # An externally owned account has no contract code at all.
    stranger = create_account()
    assert not tx_execution_succeeded(
        _write_raw(governor, "request_listing", [stranger.address, "Ghost", "EOA"])
    )
    assert _read(governor, "get_listing_requests", []) == []


def test_deposit_allowed_when_not_paused(governor, vault):
    _write(vault, "deposit", [500])

    state = _read(governor, "get_protocol_state", [vault])
    assert state["total_deposits"] == 1500
    assert state["paused"] is False


def test_exploit_adjudication_halts_protocol(governor, vault, llm_mocks):
    _write(
        governor,
        "propose_halt",
        [vault, "Withdrawals leak user funds", "A user withdrew more than they deposited"],
        wait_triggered=True,
        sim_config=llm_mocks,
    )

    assert _read(governor, "is_halted", [vault]) is True
    assert _read(vault, "is_paused", []) is True


def test_rehalt_does_not_double_count(governor, vault, llm_mocks):
    before = _read(governor, "get_governance_state", [])
    assert before["exploit_count"] == 1

    _write(
        governor,
        "propose_halt",
        [vault, "Withdrawals leak user funds", "A user withdrew more than they deposited"],
        wait_triggered=True,
        sim_config=llm_mocks,
    )

    after = _read(governor, "get_governance_state", [])
    assert after["exploit_count"] == 1
    assert _read(governor, "is_halted", [vault]) is True
    assert _read(vault, "is_paused", []) is True


def test_resume_after_proven_safe(governor, vault, llm_mocks):
    _write(
        governor,
        "prove_safe",
        [vault, "Fix deployed; no exploit"],
        wait_triggered=True,
        sim_config=llm_mocks,
    )

    assert _read(governor, "is_halted", [vault]) is False
    assert _read(vault, "is_paused", []) is False


def test_autonomous_tuning_rewrites_rules(governor, llm_mocks):
    before = _read(governor, "get_governance_state", [])
    assert before["risk_threshold"] == 50

    _write(governor, "monitor_and_tune", [], sim_config=llm_mocks)

    after = _read(governor, "get_governance_state", [])
    assert after["risk_threshold"] == 100
    assert after["tune_count"] == 1
    assert after["rule_version"] == before["rule_version"] + 1
    assert "Auto-tune #1" in after["rules"]


@pytest.fixture(scope="session")
def curator():
    return _deploy("Curator", [70])


def test_curator_lists_strong_governor(curator, governor, llm_mocks):
    result = _write(curator, "submit_governor", [governor], sim_config=llm_mocks)

    review = _read(curator, "get_review", [governor])
    assert review["score"] == 85
    assert review["listed"] is True

    listed = _read(curator, "get_listed_governors", [])
    assert len(listed) == 1
    assert listed[0]["address"].lower() == governor.lower()
    assert listed[0]["score"] == 85


def test_curator_rejects_non_owner_submission(curator, governor):
    from gltest.accounts import create_account

    stranger = create_account()
    assert not tx_execution_succeeded(
        _write_raw(curator, "submit_governor", [governor], account=stranger)
    )

#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated unit tests for the LLM integration of the AI Errand Assistant Service
#  Author review: Code changes were checked and validated


import asyncio
import json
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException

from main.llm import generate_extraction
from main.schemas import BuildingCandidate, SupplierCandidate


SUPPLIER_ID = UUID("11111111-1111-4111-8111-111111111111")
BUILDING_ID = UUID("22222222-2222-4222-8222-222222222222")


def test_openai_request_and_structured_output(monkeypatch):
    extraction = {
        "supplier_id": str(SUPPLIER_ID),
        "required_item": "iced milo",
        "delivery_building_id": str(BUILDING_ID),
        "delivery_floor": "L2",
        "delivery_description": "Deliver to COM3",
        "expires_at": "2026-11-09T17:00:00+08:00",
        "similar_history_indices": [0],
        "requested_credits": 10,
    }

    history = [
        {
            "item": "iced milo",
            "supplier_id": str(SUPPLIER_ID),
            "supplier_name": "The Deck",
            "credit_value": 7,
            "deadline_lead_minutes": 120,
        }
    ]

    def handle(request):
        assert str(request.url) == "https://api.openai.com/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-api-key"
        request_body = json.loads(request.read())
        assert request_body["model"] == "gpt-4o-mini"
        assert request_body["response_format"] == {"type": "json_object"}
        assert request_body["messages"][0]["role"] == "system"
        content = json.loads(request_body["messages"][1]["content"])
        assert content["request"] == "iced milo from the Deck to COM3"
        assert content["completed_errand_history"][0]["credit_value"] == 7
        body = {"choices": [{"message": {"content": json.dumps(extraction)}}]}
        return httpx.Response(200, json=body)

    original_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        return original_client(
            *args,
            **kwargs,
            transport=httpx.MockTransport(handle),
        )

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)

    result = asyncio.run(
        generate_extraction(
            "iced milo from the Deck to COM3",
            __import__("datetime").datetime.fromisoformat("2026-11-09T13:00:00+08:00"),
            [SupplierCandidate(id=SUPPLIER_ID, name="The Deck", building="UTown")],
            [BuildingCandidate(id=BUILDING_ID, name="COM3")],
            history,
        )
    )
    assert result.required_item == "iced milo"
    assert result.supplier_id == SUPPLIER_ID
    assert result.delivery_building_id == BUILDING_ID
    assert result.similar_history_indices == [0]
    assert result.requested_credits == 10


def test_missing_openai_api_key_is_service_unavailable(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            generate_extraction(
                "iced milo",
                __import__("datetime").datetime.fromisoformat("2026-11-09T13:00:00+08:00"),
                [],
                [],
                [],
            )
        )
    assert error.value.status_code == 503


def run_with_openai_response(monkeypatch, response):
    original_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        return original_client(
            *args, **kwargs, transport=httpx.MockTransport(lambda request: response)
        )

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            generate_extraction(
                "iced milo",
                __import__("datetime").datetime.fromisoformat("2026-11-09T13:00:00+08:00"),
                [],
                [],
                [],
            )
        )
    return error.value


def openai_text(text):
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


@pytest.mark.parametrize(
    "text",
    [
        "Sure! Here is your draft.",  # not JSON
        '{"supplier_id": null}',  # missing keys
        json.dumps(  # unexpected extra key
            {
                "supplier_id": None, "required_item": "x", "delivery_building_id": None,
                "delivery_floor": None, "delivery_description": None, "expires_at": None,
                "similar_history_indices": [], "credit_value": 25,
            }
        ),
        json.dumps(  # wrong type
            {
                "supplier_id": "not-a-uuid", "required_item": "x", "delivery_building_id": None,
                "delivery_floor": None, "delivery_description": None, "expires_at": None,
            }
        ),
    ],
)
def test_invalid_llm_output_is_bad_gateway(monkeypatch, text):
    error = run_with_openai_response(monkeypatch, openai_text(text))
    assert error.status_code == 502


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [(401, 503), (403, 503), (429, 503), (500, 503), (400, 502)],
)
def test_openai_http_errors_are_mapped(monkeypatch, status_code, expected):
    error = run_with_openai_response(monkeypatch, httpx.Response(status_code, json={}))
    assert error.status_code == expected


def test_openai_model_can_be_overridden(monkeypatch):
    seen = {}

    def handle(request):
        seen["model"] = json.loads(request.read())["model"]
        return openai_text("not json")

    original_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        return original_client(*args, **kwargs, transport=httpx.MockTransport(handle))

    monkeypatch.setattr(httpx, "AsyncClient", mock_client)
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
    with pytest.raises(HTTPException):
        asyncio.run(
            generate_extraction(
                "iced milo",
                __import__("datetime").datetime.fromisoformat("2026-11-09T13:00:00+08:00"),
                [],
                [],
                [],
            )
        )
    assert seen["model"] == "gpt-4.1-mini"

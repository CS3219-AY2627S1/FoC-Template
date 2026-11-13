"""Read-only documentation checks; not a substitute for live consumer tests.

From order-service: python scripts/validate-asyncapi-contract.py
Requires PyYAML and jsonschema in the local Python environment.

AI assistance: OpenAI Codex, 2026-10-10/11; documentation validator generation.
Vincent approved the documentation scope; human review remains pending.
"""

import copy
import re
from pathlib import Path

import yaml
from jsonschema import Draft7Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / "src/main/java/sg/edu/nus/foc/order"
SPEC = ROOT / "docs/asyncapi/asyncapi.yaml"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def fields(class_name):
    source = (JAVA / f"messagingpublisher/dto/{class_name}.java").read_text(encoding="utf-8")
    # Current DTOs use explicit fields; exclude operational-only JsonIgnore fields.
    ignored = set(re.findall(r"@JsonIgnore\s+private\s+\w+\s+(\w+)\s*;", source))
    return set(re.findall(r"private\s+\w+\s+(\w+)\s*;", source)) - ignored


def json_schema(value):
    if isinstance(value, dict):
        return {key: (item.replace("#/components/schemas/", "#/$defs/")
                      if key == "$ref" else json_schema(item))
                for key, item in value.items()}
    if isinstance(value, list):
        return [json_schema(item) for item in value]
    return value


def main():
    spec = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    require(spec["asyncapi"] == "3.0.0", "Unexpected AsyncAPI version")
    schemas = spec["components"]["schemas"]
    for name in ("OpenOrderRefundTaskEvent", "OrderCompletionTaskEvent",
                 "PenaltyScoreAdditionEvent", "PenaltyScoreDeductionEvent"):
        require(set(schemas[name]["properties"]) == fields(name), f"{name}: DTO field drift")

    config = (ROOT / "src/main/resources/application.yaml").read_text(encoding="utf-8")
    mapper = (JAVA / "messagingpublisher/mapper/OrderTaskEventMapper.java").read_text(encoding="utf-8")
    expected = {
        "openRefund": ("OpenOrderRefundTaskEvent", "open-order-refund", "ORDER_OPEN_REFUND_TOPIC", "open-order-refund-dev-v1", "2"),
        "completion": ("OrderCompletionTaskEvent", "order-completion", "ORDER_COMPLETION_TOPIC", "order-completion-dev-v1", "2"),
        "penaltyAddition": ("PenaltyScoreAdditionEvent", "courier-penalty-event", "ORDER_COURIER_PENALTY_EVENT_TOPIC", "courier-penalty-event-dev-v1", "2"),
        "penaltyDeduction": ("PenaltyScoreDeductionEvent", "courier-penalty-event", "ORDER_COURIER_PENALTY_EVENT_TOPIC", "courier-penalty-event-dev-v1", "2"),
    }
    require(set(spec["channels"]) == {"openRefund", "completion", "penaltyEvents", "compensationRequest", "compensationResult", "reportCompensationRequest", "reportCompensationResult", "reportCreationCompensationRequest", "reportCreationCompensationResult"},
            "Expected three lifecycle/penalty and six compensation channels")
    require(len(spec["operations"]) == 10, "Expected seven sends and three receives")
    checked_examples = 0
    for channel_id, (event_type, config_key, env_key, topic, version) in expected.items():
        channel = spec["channels"]["penaltyEvents" if channel_id.startswith("penalty") else channel_id]
        require(channel["parameters"]["topicId"]["default"] == topic, "Topic default drift")
        require(channel["x-topic-environment-variable"] == env_key, "Topic variable drift")
        require(f"{config_key}: ${{{env_key}:{topic}}}" in config, "Configuration source drift")
        typed_publisher = (JAVA / f"messagingpublisher/publisher/{event_type[:-5]}Publisher.java").read_text(encoding="utf-8")
        require(f"order.messaging.topics.{config_key}:" in typed_publisher, "Typed publisher routing drift")
        message = spec["components"]["messages"][event_type]
        require(message["payload"]["$ref"] == f"#/components/schemas/{event_type}", "Wrong message schema")
        headers = message["headers"]
        require(set(headers["properties"]) == {"eventId", "eventType", "eventVersion"}, "Attribute drift")
        require(headers["properties"]["eventVersion"]["const"] == version, "Wire version drift")
        require(headers["properties"]["eventType"]["const"] == event_type, "Wrong event type")
        require(re.search(r'target = "eventType", constant = "' + event_type
                          + r'"\)\s+@Mapping\(target = "eventVersion", constant = "'
                          + version + r'"', mapper), "Mapper event version drift")
        body_schema = json_schema(copy.deepcopy(schemas[event_type]))
        body_schema["$defs"] = json_schema(schemas)
        Draft7Validator.check_schema(body_schema)
        validator = Draft7Validator(body_schema, format_checker=FormatChecker())
        header_validator = Draft7Validator(headers, format_checker=FormatChecker())
        for example in message["examples"]:
            validator.validate(example["payload"])
            header_validator.validate(example["headers"])
            require(example["headers"]["eventId"] == example["payload"]["eventId"], "Event ID attribute mismatch")
            checked_examples += 1
        # Negative checks catch extra compact fields and invalid versions/statuses.
        invalid = copy.deepcopy(message["examples"][0]["payload"])
        invalid["undocumentedField"] = True
        require(not validator.is_valid(invalid), "Extra body field was accepted")
        invalid_headers = copy.deepcopy(message["examples"][0]["headers"])
        invalid_headers["eventVersion"] = "999"
        require(not header_validator.is_valid(invalid_headers), "Invalid version was accepted")
        invalid_status = copy.deepcopy(message["examples"][0]["payload"])
        if event_type.startswith("PenaltyScore"):
            invalid_status["penaltyAmount"] = 0
        else:
            invalid_status["orderStatus"] = "OPEN"
        require(not validator.is_valid(invalid_status), "Invalid outcome status was accepted")

    for operation in spec["operations"].values():
        channel_id = operation["channel"]["$ref"].split("/")[-1]
        require(operation["action"] == ("receive" if channel_id in {"compensationResult", "reportCompensationResult", "reportCreationCompensationRequest"} else "send"),
                "Wrong operation direction")
        require("reply" not in operation, "Publication acknowledgment is not a business reply")
        require(channel_id in spec["channels"], "Unknown channel")
    for message_name, record_name in (("CreditCompensationRequested", "CreditCompensationRequest"),
                                      ("CreditCompensationResult", "CreditCompensationResult")):
        source = (JAVA / f"application/recovery/{record_name}.java").read_text(encoding="utf-8")
        record_fields = set(re.findall(r"(?:String|long|Long)\s+(\w+)\s*[,)]", source))
        require(set(schemas[message_name]["properties"]) == record_fields, "Compensation DTO drift")
        schema = json_schema(copy.deepcopy(schemas[message_name]))
        Draft7Validator.check_schema(schema)
        validator = Draft7Validator(schema, format_checker=FormatChecker())
        message = spec["components"]["messages"][message_name]
        for example in message["examples"]:
            validator.validate(example["payload"])
            Draft7Validator(message["headers"]).validate(example["headers"])
            invalid = copy.deepcopy(example["payload"])
            invalid["generation"] = 0
            require(not validator.is_valid(invalid), "Invalid compensation generation accepted")
            checked_examples += 1
    report_source = (JAVA / "application/reportresolution/ReportResolutionMessages.java").read_text(encoding="utf-8")
    for name, record in (("ReportResolutionCompensationRequested", "Compensation"), ("ReportResolutionCompensationResult", "Result")):
        declaration = re.search(r"record " + record + r"\((.*?)\)", report_source, re.S).group(1)
        record_fields = set(re.findall(r"(?:String|long)\s+(\w+)", declaration))
        require(set(schemas[name]["properties"]) == record_fields, "Report compensation DTO drift")
        schema = schemas[name]
        Draft7Validator.check_schema(schema)
        validator = Draft7Validator(schema, format_checker=FormatChecker())
        message = spec["components"]["messages"][name]
        for example in message["examples"]:
            validator.validate(example["payload"])
            Draft7Validator(message["headers"]).validate(example["headers"])
            require(example["headers"]["eventId"] == example["payload"]["eventId"], "Report ID mismatch")
            for generation in (0, 1, 3):
                invalid = copy.deepcopy(example["payload"])
                invalid["generation"] = generation
                require(not validator.is_valid(invalid), "Report fence generation drift")
            invalid = copy.deepcopy(example["payload"])
            invalid["token"] = "must-not-publish"
            require(not validator.is_valid(invalid), "Report body accepts undeclared data")
            checked_examples += 1
    require("enabled: ${ORDER_REPORT_RESOLUTION_ENABLED:false}" in config, "Report integration must default off")
    require("compensation-topic: ${ORDER_REPORT_COMPENSATION_TOPIC:}" in config, "Report request topic config drift")
    require("result-topic: ${REPORT_COMPENSATION_RESULT_TOPIC:}" in config, "Report result topic config drift")
    require("request-topic: ${ORDER_COMPENSATION_REQUEST_TOPIC:}" in config, "Compensation topic config drift")
    require("enabled: ${ORDER_COMPENSATION_ENABLED:false}" in config, "Compensation default must remain off")
    publisher = (JAVA / "messagingpublisher/publisher/GoogleCloudPubSubEventPublisher.java").read_text(encoding="utf-8")
    require(set(re.findall(r'\.putAttributes\("([^"]+)"', publisher)) == {"eventId", "eventType", "eventVersion"}, "Publisher attribute drift")
    require("setOrderingKey" in publisher, "Unified penalty ordering key is required")
    scheduler = (JAVA / "application/OrderOutboxScheduler.java").read_text(encoding="utf-8")
    require("0 */15 * * * *" in scheduler, "Outbox default cadence drift")
    print(f"PASS: 7 send/3 receive operations, current DTO field sets, {checked_examples} examples, negative schemas and source/default/topic/cadence parity.")


if __name__ == "__main__":
    main()

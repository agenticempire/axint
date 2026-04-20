"""Example: HealthKit logging intent.

Run it:

    axint-py parse examples/health_log.py
    axint-py compile examples/health_log.py --stdout
"""

from axint import define_intent, param

health_log = define_intent(
    name="LogHealthMetric",
    title="Log Health Metric",
    description="Records a health measurement like weight, blood pressure, or exercise.",
    domain="health",
    entitlements=["com.apple.developer.healthkit"],
    info_plist_keys={
        "NSHealthShareUsageDescription": "Read prior health measurements to compare your progress.",
        "NSHealthUpdateUsageDescription": "Save new health measurements that you log from this shortcut.",
    },
    params={
        "metric": param.string("What you're logging (for example weight or steps)"),
        "value": param.double("The measurement value"),
        "date": param.date("When the measurement was taken"),
        "duration": param.duration("Activity duration", optional=True),
        "notes": param.string("Additional notes", optional=True),
    },
)

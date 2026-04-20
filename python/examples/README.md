# Python examples

These examples mirror the maintained public Python SDK surfaces.

| File | Surface | What it demonstrates |
| --- | --- | --- |
| `create_event.py` | Intent | Basic event-creation flow from Python |
| `health_log.py` | Intent | HealthKit + privacy copy in the native Python pipeline |
| `profile_card.py` | View | SwiftUI view generation from Python |
| `step_counter_widget.py` | Widget | WidgetKit coverage from Python |
| `weather_app.py` | App | Full app generation from the Python SDK |

Try them directly:

```bash
axint-py parse python/examples/create_event.py --json
axint-py compile python/examples/health_log.py --stdout
axint-py compile python/examples/step_counter_widget.py --stdout
axint-py compile python/examples/weather_app.py --stdout
```

The Python SDK uses the same public version contract as npm. Intentional releases should move both package managers together.

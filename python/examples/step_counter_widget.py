"""Example: step counter widget.

Run it:

    axint-py parse examples/step_counter_widget.py
    axint-py compile examples/step_counter_widget.py --stdout
"""

from axint import define_widget, entry, view

step_counter = define_widget(
    name="StepCounter",
    display_name="Step Counter",
    description="Shows your daily step count and progress.",
    families=["systemSmall", "systemMedium"],
    entry={
        "steps": entry.int("Current step count", default=0),
        "goal": entry.int("Daily goal", default=10000),
        "last_updated": entry.date("Last sync time"),
    },
    body=[
        view.vstack(
            [
                view.text("steps"),
                view.text("goal"),
            ],
            spacing=4,
            alignment="center",
        )
    ],
    refresh_interval=15,
)

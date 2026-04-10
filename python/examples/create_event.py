"""Example: create a calendar event.

Run it:

    axintai parse examples/create_event.py
    axintai parse examples/create_event.py --json
"""

from axintai import define_intent, param

create_event = define_intent(
    name="CreateCalendarEventIntent",
    title="Create Calendar Event",
    description="Creates a new event on the user's calendar",
    domain="productivity",
    params={
        "event_title": param.string("Title of the event"),
        "start_date": param.date("When the event starts"),
        "duration_minutes": param.int("Length of the event in minutes"),
        "is_all_day": param.boolean(
            "Whether the event is all-day",
            optional=True,
            default=False,
        ),
    },
    entitlements=["com.apple.developer.calendars"],
    info_plist_keys=["NSCalendarsUsageDescription"],
)

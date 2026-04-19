"""Example: profile card view.

Run it:

    axint-py parse examples/profile_card.py
    axint-py compile examples/profile_card.py --stdout
"""

from axint import define_view, prop, state, view

profile_card = define_view(
    name="ProfileCard",
    props={
        "display_name": prop.string("User display name"),
        "join_date": prop.date("Join date"),
        "avatar_url": prop.url("Avatar URL"),
    },
    state={
        "show_details": state.boolean("Show details", default=False),
    },
    body=[
        view.vstack(
            [
                view.text("display_name"),
                view.button("Toggle details", "show_details.toggle()"),
                view.conditional(
                    "show_details",
                    [
                        view.text("join_date"),
                    ],
                ),
            ],
            spacing=12,
            alignment="leading",
        )
    ],
)

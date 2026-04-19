"""Parity tests for the Python entity generator.

Every expected string in this file was captured from the TypeScript reference
generator (src/core/generator.ts). If these diverge, the Python and TS SDKs
are no longer producing compatible Swift — which breaks the registry promise
that a package authored in either language drops into any project.
"""

from __future__ import annotations

from axint import generate_entity, generate_entity_query
from axint.ir import DisplayRepresentationIR, EntityIR, IntentParameter


def _entity(
    *,
    properties: tuple[IntentParameter, ...] = (),
    query_type: str = "id",
    display: DisplayRepresentationIR | None = None,
) -> EntityIR:
    return EntityIR(
        name="Contact",
        display_representation=display
        or DisplayRepresentationIR(title="name"),
        properties=properties,
        query_type=query_type,
    )


def test_generate_entity_adds_id_when_absent() -> None:
    swift = generate_entity(_entity())
    assert "struct Contact: AppEntity {" in swift
    assert "static var defaultQuery = ContactQuery()" in swift
    assert "var id: String" in swift


def test_generate_entity_skips_synthesized_id_when_present() -> None:
    swift = generate_entity(
        _entity(
            properties=(
                IntentParameter(name="id", type="string", description="uuid"),
                IntentParameter(name="name", type="string", description="display name"),
            ),
        )
    )
    # Should appear exactly once — we don't double-declare it.
    assert swift.count("var id: String") == 1
    assert '@Property(title: "uuid")' not in swift
    assert '@Property(title: "display name")' in swift
    assert "var name: String" in swift


def test_generate_entity_display_representation_title_only() -> None:
    swift = generate_entity(_entity())
    # No trailing comma on title when there's no subtitle/image.
    assert 'title: "\\(name)"' in swift
    assert 'title: "\\(name)",' not in swift


def test_generate_entity_display_representation_with_subtitle_and_image() -> None:
    swift = generate_entity(
        _entity(
            display=DisplayRepresentationIR(
                title="name",
                subtitle="email",
                image="person.circle",
            ),
        ),
    )
    assert 'title: "\\(name)",' in swift
    assert 'subtitle: "\\(email)",' in swift
    assert 'image: .init(systemName: "person.circle")' in swift


def test_generate_entity_query_id_protocol() -> None:
    swift = generate_entity_query(_entity())
    assert "struct ContactQuery: EntityQuery {" in swift
    assert "func entities(for identifiers: [Contact.ID]) async throws -> [Contact]" in swift
    assert "ID-based query is provided by the entities(for:) method above" in swift


def test_generate_entity_query_all() -> None:
    swift = generate_entity_query(_entity(query_type="all"))
    assert "struct ContactQuery: EnumerableEntityQuery {" in swift
    assert "func suggestedEntities() async throws -> [Contact]" in swift
    assert 'static var findIntentDescription: IntentDescription = IntentDescription("Find Contact")' in swift
    assert "func allEntities() async throws -> [Contact]" in swift


def test_generate_entity_query_string() -> None:
    swift = generate_entity_query(_entity(query_type="string"))
    assert "struct ContactQuery: EntityStringQuery {" in swift
    assert "func suggestedEntities() async throws -> [Contact]" in swift
    assert "func entities(matching string: String) async throws -> [Contact]" in swift


def test_generate_entity_query_property() -> None:
    swift = generate_entity_query(
        _entity(
            properties=(
                IntentParameter(name="name", type="string", description="full name"),
                IntentParameter(name="age", type="int", description="years"),
            ),
            query_type="property",
        )
    )
    assert "struct ContactQuery: EntityPropertyQuery {" in swift
    assert 'static var findIntentDescription: IntentDescription = IntentDescription("Find Contact")' in swift
    assert "static var properties = QueryProperties {" in swift
    # String props get Equal + Contains comparators.
    assert "Property(\\.$name) {" in swift
    assert "EqualToComparator()" in swift
    assert "ContainsComparator()" in swift
    # Numeric props get Equal + Less + Greater.
    assert "Property(\\.$age) {" in swift
    assert "LessThanComparator()" in swift
    assert "GreaterThanComparator()" in swift
    # Both go into the sort options block.
    assert "SortableBy(\\.$name)" in swift
    assert "SortableBy(\\.$age)" in swift
    # And the filter/sort function signature is emitted.
    assert "mode: ComparatorMode" in swift
    assert "limit: Int?" in swift

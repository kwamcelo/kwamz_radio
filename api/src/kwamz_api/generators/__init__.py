"""Choosing the RadioGenerator from config (RADIO_GENERATOR)."""

import importlib
from collections.abc import Callable

from kwamz_api.generators import dummy
from kwamz_core.radio import GeneratorDeps, RadioGenerator

type GeneratorFactory = Callable[[GeneratorDeps], RadioGenerator]

BUILT_IN: dict[str, GeneratorFactory] = {"dummy": dummy.build}


def load_generator(spec: str, deps: GeneratorDeps) -> RadioGenerator | None:
    """`spec` is a built-in name, an import path "package.module:factory", or "" for none."""
    if not spec:
        return None
    if spec in BUILT_IN:
        return BUILT_IN[spec](deps)
    module_name, sep, attr = spec.partition(":")
    if not sep or not module_name or not attr:
        raise ValueError(
            f"RADIO_GENERATOR={spec!r}: expected one of {sorted(BUILT_IN)} or 'module:factory'"
        )
    factory: GeneratorFactory = getattr(importlib.import_module(module_name), attr)
    return factory(deps)

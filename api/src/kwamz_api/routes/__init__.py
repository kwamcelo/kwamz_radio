from fastapi import APIRouter
from fastapi.routing import APIRoute


def operation_id(route: APIRoute) -> str:
    """Stable, readable operation ids for the generated client: the function name."""
    return route.name


def make_router(tag: str) -> APIRouter:
    return APIRouter(tags=[tag], generate_unique_id_function=operation_id)

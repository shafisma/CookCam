"""
CookCam — Gemini Tool Declarations & Handlers
Function-calling tools for timers, recipe management, step tracking, etc.
"""

import uuid
import time
from datetime import datetime
from google.genai import types
from api.firestore_client import save_recipe as _persist_recipe, get_all_recipes

# ─── Tool Declarations ───────────────────────────────────────────────────

TOOLS_LIST = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="set_timer",
                description="Set a visible cooking timer on the user's screen. Use whenever timing is needed — boiling, baking, resting, marinating, etc.",
                parameters={
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "description": "What the timer is for, e.g. 'Boil pasta', 'Rest steak'"},
                        "duration_seconds": {"type": "integer", "description": "Duration in seconds"},
                    },
                    "required": ["label", "duration_seconds"],
                },
            ),
            types.FunctionDeclaration(
                name="save_recipe",
                description="Save a recipe to the user's collection. Call when the user asks to save, or when you finish guiding them through a recipe.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Recipe title"},
                        "description": {"type": "string", "description": "Short description"},
                        "ingredients": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Ingredients with quantities, e.g. '2 cups flour'",
                        },
                        "steps": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Ordered cooking steps",
                        },
                        "servings": {"type": "integer", "description": "Number of servings"},
                        "prep_time_minutes": {"type": "integer", "description": "Prep time in minutes"},
                        "cook_time_minutes": {"type": "integer", "description": "Cook time in minutes"},
                    },
                    "required": ["title", "ingredients", "steps"],
                },
            ),
            types.FunctionDeclaration(
                name="set_recipe_steps",
                description="Display a step-by-step recipe tracker on the user's screen. Use when starting to guide someone through a recipe.",
                parameters={
                    "type": "object",
                    "properties": {
                        "recipe_name": {"type": "string", "description": "Recipe name"},
                        "steps": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Ordered cooking steps",
                        },
                        "current_step": {"type": "integer", "description": "Current step index (0-based), default 0"},
                    },
                    "required": ["recipe_name", "steps"],
                },
            ),
            types.FunctionDeclaration(
                name="update_current_step",
                description="Advance or change the current step in the recipe tracker. Use as the user progresses through cooking.",
                parameters={
                    "type": "object",
                    "properties": {
                        "step_index": {"type": "integer", "description": "Step index to set as current (0-based)"},
                    },
                    "required": ["step_index"],
                },
            ),
            types.FunctionDeclaration(
                name="generate_ingredient_list",
                description="Display an ingredient checklist on the user's screen so they can check off what they have. Use when suggesting a recipe.",
                parameters={
                    "type": "object",
                    "properties": {
                        "recipe_name": {"type": "string", "description": "Recipe name"},
                        "ingredients": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string", "description": "Ingredient name"},
                                    "amount": {"type": "string", "description": "Amount needed"},
                                },
                                "required": ["name", "amount"],
                            },
                            "description": "List of ingredients with amounts",
                        },
                    },
                    "required": ["recipe_name", "ingredients"],
                },
            ),
            types.FunctionDeclaration(
                name="show_nutritional_info",
                description="Display estimated nutritional info for a dish. Use when the user asks about calories or nutrition.",
                parameters={
                    "type": "object",
                    "properties": {
                        "dish_name": {"type": "string", "description": "Dish name"},
                        "servings": {"type": "integer", "description": "Number of servings"},
                        "calories_per_serving": {"type": "integer", "description": "Estimated calories per serving"},
                        "protein_grams": {"type": "integer", "description": "Protein grams per serving"},
                        "carbs_grams": {"type": "integer", "description": "Carbs grams per serving"},
                        "fat_grams": {"type": "integer", "description": "Fat grams per serving"},
                        "fiber_grams": {"type": "integer", "description": "Fiber grams per serving"},
                    },
                    "required": ["dish_name", "calories_per_serving", "protein_grams", "carbs_grams", "fat_grams"],
                },
            ),
        ]
    )
]


# ─── Tool Execution ──────────────────────────────────────────────────────

def execute_tool(name: str, args: dict) -> tuple:
    """Execute a tool. Returns (gemini_response_dict, browser_message_or_None)."""
    handler = _HANDLERS.get(name)
    if handler:
        return handler(args)
    return {"error": f"Unknown tool: {name}"}, None


def _handle_set_timer(args):
    label = args.get("label", "Timer")
    duration = int(args.get("duration_seconds", 60))
    timer_id = str(uuid.uuid4())[:8]
    browser = {
        "type": "tool_ui",
        "tool": "set_timer",
        "data": {"id": timer_id, "label": label, "duration_seconds": duration},
    }
    return {"status": "success", "message": f"Timer '{label}' set for {duration}s."}, browser


def _handle_save_recipe(args):
    recipe = {
        "id": str(uuid.uuid4())[:8],
        "title": args.get("title", "Untitled"),
        "description": args.get("description", ""),
        "ingredients": args.get("ingredients", []),
        "steps": args.get("steps", []),
        "servings": args.get("servings"),
        "prep_time_minutes": args.get("prep_time_minutes"),
        "cook_time_minutes": args.get("cook_time_minutes"),
        "saved_at": datetime.now().isoformat(),
    }
    _persist_recipe(recipe)
    browser = {"type": "tool_ui", "tool": "save_recipe", "data": recipe}
    return {"status": "success", "message": f"Recipe '{recipe['title']}' saved."}, browser


def _handle_set_recipe_steps(args):
    data = {
        "recipe_name": args.get("recipe_name", "Recipe"),
        "steps": args.get("steps", []),
        "current_step": int(args.get("current_step", 0)),
    }
    browser = {"type": "tool_ui", "tool": "set_recipe_steps", "data": data}
    n = len(data["steps"])
    return {"status": "success", "message": f"Showing step {data['current_step']+1}/{n}."}, browser


def _handle_update_step(args):
    idx = int(args.get("step_index", 0))
    browser = {"type": "tool_ui", "tool": "update_current_step", "data": {"step_index": idx}}
    return {"status": "success", "message": f"Advanced to step {idx+1}."}, browser


def _handle_ingredient_list(args):
    data = {
        "recipe_name": args.get("recipe_name", "Recipe"),
        "ingredients": args.get("ingredients", []),
    }
    browser = {"type": "tool_ui", "tool": "generate_ingredient_list", "data": data}
    return {"status": "success", "message": f"Checklist shown with {len(data['ingredients'])} items."}, browser


def _handle_nutritional_info(args):
    data = {
        "dish_name": args.get("dish_name", "Dish"),
        "servings": args.get("servings", 1),
        "calories": args.get("calories_per_serving", 0),
        "protein": args.get("protein_grams", 0),
        "carbs": args.get("carbs_grams", 0),
        "fat": args.get("fat_grams", 0),
        "fiber": args.get("fiber_grams", 0),
    }
    browser = {"type": "tool_ui", "tool": "nutritional_info", "data": data}
    return {"status": "success", "message": "Nutritional info displayed."}, browser


def get_saved_recipes() -> list:
    """Return all saved recipes (used by API endpoint)."""
    return get_all_recipes()


_HANDLERS = {
    "set_timer": _handle_set_timer,
    "save_recipe": _handle_save_recipe,
    "set_recipe_steps": _handle_set_recipe_steps,
    "update_current_step": _handle_update_step,
    "generate_ingredient_list": _handle_ingredient_list,
    "show_nutritional_info": _handle_nutritional_info,
}

# Agent Behaviors

## Movement
- Walk speed: 100 pixels/second
- Pathfinding: Simple A* or direct line?
- Collision: Agents should avoid each other

## States
- IDLE: Standing still, looking around
- WALKING: Moving to destination
- THINKING: Making API call, speech bubble active
- WORKING: Writing code, plant growing animation
- COMPOSTING: Summarizing context

## Speech Bubbles
- Max width: 200px
- Fade in/out: 300ms
- Stream words as they arrive from API
- Auto-dismiss after 5 seconds of no new content
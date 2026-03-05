# Agent Garden - Project Brief

## Vision
A visual desktop app where AI agents (powered by Claude API) are pixel art gardeners 
working in a garden that represents your codebase. Watch them work in real-time 
on actual development tasks.

## Core Metaphor
- **Plants** = Context windows & code files
- **Garden sections** = Different parts of codebase (frontend/backend/tests)
- **Agents** = Claude API instances doing real work
- **Garden health** = Code quality metrics

## Key Features
1. **Real-time visualization** - See agents move, think (speech bubbles), and work
2. **Actual functional output** - Agents create real code files
3. **Context window tracking** - Visual backpack that fills up
4. **Multi-agent collaboration** - Multiple Claude instances working together
5. **Customizable themes** - Different garden styles

## Technical Stack
- Electron (desktop app)
- React (UI components)
- Phaser.js or PixiJS (2D rendering & animations)
- Claude API with streaming
- Node.js backend for file system access

## User Flow
1. User opens app, sees empty garden
2. User types a task: "Create a React login component"
3. Agent walks to work area
4. Agent makes Claude API call (shows thinking in speech bubble)
5. As code is generated, plant grows in real-time
6. File is saved to watched directory
7. Agent returns to idle state

## MVP Scope (First Version)
- [ ] Single agent that can move around
- [ ] Claude API integration with streaming
- [ ] Speech bubbles showing agent thoughts
- [ ] Basic plant growth when files created
- [ ] Simple task input
- [ ] Watch one directory for file changes

## Nice-to-Have (Later)
- Multiple agents
- Garden sections/zones
- Context window visualization
- Different agent types (weeder, planter, etc.)
- Time-lapse recording
- Custom themes
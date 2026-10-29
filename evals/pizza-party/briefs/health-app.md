<!-- evals/pizza-party/briefs/health-app.md -->
<!-- The first /pizza-party benchmark brief (2026-10-29). Rerun it as models and the plugin change, then compare with `node scripts/pizza-party.js runs --brief health-app`. -->

# Brief: health-app

Build a very simple private app for logging my diet and workouts, with a persistent database and an agent plugin I can use through ChatGPT or Claude.

Keep the app focused on three things:
1. Log meals.
2. Log workouts.
3. Save background information that helps the agent personalize its answers.

## Dashboard

Keep the interface minimal:
- Add a meal.
- Add a workout.
- View and edit recent entries.

Do not add charts, nutrition targets, reminders, complex analytics, or extra features unless I request them. Background information does not need its own dashboard section.

## Diet logging

Let me describe a meal or upload a photo through chat. Save the date/time, foods, and approximate portions when provided. Ask a short follow-up only when needed. Do not require calories, macros, or exact measurements to save a meal.

## Workout logging

Save the date, exercises, and weight and repetitions for each set. Include optional notes, such as difficulty or discomfort. Preserve workout history so the agent can answer questions like:
- "What did I lift last week?"
- "What weight did I use for each bench press set?"
- "Write this week's plan based on my last workouts."

Clearly distinguish planned workouts from completed workouts. Never save a proposed workout as something I actually completed.

## Background information

Save useful context without cluttering the dashboard, including:
- Relevant health information I choose to share.
- Foods I will not eat.
- Foods I am open to trying.
- Foods I have tried and whether I liked or tolerated them.
- Workout goals, equipment, preferences, and limitations.

Keep explicit preferences separate from guesses. Let me update or remove this information through chat.

## Chat / plugin

The dashboard and plugin must use the same database. In a new ChatGPT or Claude conversation with the plugin installed and enabled, I should be able to say:
- "Log this meal," with text or a photo.
- "Log three sets of bench: 135 x 10, 155 x 8, 165 x 6."
- "Remember that I won't eat mushrooms."
- "What did I do for legs last week?"
- "Plan my meals using foods I like."
- "Build this week's workouts using my recent performance."

Retrieve relevant saved records before answering personalized questions. Do not rely on the current chat's memory or invent missing history. Save clear logging requests directly, ask only necessary questions, and briefly confirm what was saved. Mark photo-based estimates as estimates.

## Implementation

Use the simplest architecture that supports these requirements. Keep my records private and authenticated. Reuse my existing Claude workout artifact where practical. Avoid duplicate records and make corrections easy.

Success means I can quickly log meals and workouts, then ask the connected agent questions that use my saved history and preferences. Build only what is needed to make that work reliably.

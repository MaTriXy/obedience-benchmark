# Claude Code Plugin Conventions

Research based on the babysitter plugin at version 4.0.146 (`a5c-ai/babysitter`).

---

## 1. plugin.json Schema

The root `plugin.json` is the primary manifest. Key fields:

```json
{
  "name": "babysitter",
  "version": "4.0.146",
  "description": "Human-readable description of the plugin",
  "author": "a5c.ai",
  "license": "MIT",
  "hooks": {
    "SessionStart": "hooks/babysitter-session-start-hook.sh",
    "Stop": "hooks/babysitter-stop-hook.sh"
  },
  "commands": [],
  "skills": [
    {
      "name": "babysitter",
      "file": "skills/babysit/SKILL.md"
    },
    {
      "name": "babysitter-breakpoint",
      "file": "skills/babysitter-breakpoint/SKILL.md",
      "deprecated": true,
      "replacedBy": "babysitter"
    },
    {
      "name": "babysitter-score",
      "file": "skills/babysitter-score/SKILL.md"
    }
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/a5c-ai/babysitter"
  },
  "keywords": ["orchestration", "workflow", ...]
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Plugin identifier (kebab-case) |
| `version` | string | Yes | Semver version |
| `description` | string | Yes | Human-readable description |
| `author` | string | Yes | Author name or org |
| `license` | string | No | License identifier |
| `hooks` | object | No | Map of hook event name to shell script path (relative to plugin root) |
| `commands` | array | No | Slash commands (can be empty array) |
| `skills` | array | No | Array of skill entries with `name`, `file`, optional `deprecated` and `replacedBy` |
| `repository` | object | No | Git repository info |
| `keywords` | array | No | Searchable tags |

### Secondary Manifest: `.claude-plugin/plugin.json`

A separate `.claude-plugin/plugin.json` exists with a subset of metadata. This appears to be a Claude Code platform-level manifest distinct from the plugin's own `plugin.json`:

```json
{
  "name": "babysitter",
  "version": "4.0.146",
  "description": "Implementation of the babysitter technique...",
  "author": {
    "name": "Tal Muskal",
    "email": "tal@a5c.ai"
  }
}
```

Note: the `author` field in `.claude-plugin/plugin.json` is an object with `name` and `email`, whereas in the root `plugin.json` it is a plain string.

### versions.json

Contains `sdkVersion` field indicating the SDK build version used.

### package.json

Standard npm `package.json` at plugin root, declaring SDK dependency:
```json
{
  "dependencies": {
    "@a5c-ai/babysitter-sdk": "^0.0.177"
  }
}
```

---

## 2. SKILL.md Format

There are two distinct SKILL.md formats depending on where the skill lives.

### Top-Level Skills (registered in plugin.json)

Top-level SKILL.md files use YAML frontmatter followed by a full markdown body with detailed instructions:

```markdown
---
name: babysit
description: Orchestrate via @babysitter. Use this skill when asked to babysit a run...
allowed-tools: Read, Grep, Write, Task, Bash, Edit, Grep, Glob, WebFetch, WebSearch, Search, AskUserQuestion, TodoWrite, TodoRead, Skill, BashOutput, KillShell, MultiEdit, LS
version: 0.1.1
---

# babysit

[Detailed instructions for the skill...]
```

#### Frontmatter Fields

| Field | Description |
|---|---|
| `name` | Skill identifier (must match the `name` in plugin.json skills array) |
| `description` | Detailed description including trigger keywords in parentheses |
| `allowed-tools` | Comma-separated list of tool names the skill is allowed to use |
| `version` | Semver version of the skill |

#### Body Conventions

- Begins with a top-level heading matching the skill name
- Sections cover: Dependencies, Core Workflow, Task Kinds, Quick Commands, Critical Rules, See Also
- Uses fenced code blocks for CLI commands and JSON examples
- Contains explicit "Common mistake to avoid" patterns with wrong/correct examples
- "CRITICAL RULE" items are uppercase-prefixed for emphasis
- References other files via relative paths from the skill root

### Nested Skills (within methodologies)

Some methodology SKILL.md files have frontmatter, some do not. The two variants observed:

**Variant A -- Frontmatter (specialization skills and some methodology skills):**

```markdown
---
name: analytics
description: Google Analytics 4, tag management, and event tracking.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Analytics Skill

Expert assistance for web analytics implementation.

## Capabilities
- Configure Google Analytics 4
...

## Target Processes
- analytics-setup
```

**Variant B -- Plain markdown (many methodology skills, no frontmatter):**

```markdown
# Code Review Gate

Perform code review with quality scoring and configurable threshold enforcement.

## Agent
Code Reviewer - `automaker-code-reviewer`

## Workflow
1. Step one
2. Step two

## Inputs
- `inputName` - Description

## Outputs
- Description of outputs

## Process Files
- `process-file.js` - Context
```

#### Standard Sections for Nested Skills (plain markdown variant)

1. **Title** (H1) -- skill name
2. **Description** -- one-line summary paragraph
3. **Agent** -- which agent(s) this skill works with, including agent ID in backticks
4. **Workflow** -- numbered step list
5. **Inputs** -- bullet list of input parameters with backtick names
6. **Outputs** -- bullet list or description of outputs
7. **Process Files** -- which process JS files reference this skill

#### Standard Sections for Nested Skills (frontmatter variant)

1. Frontmatter with `name`, `description`, `allowed-tools`
2. **Title** (H1)
3. **Overview/Capabilities** -- what the skill does
4. **Code examples** (optional) -- reference implementations
5. **Target Processes** or **When to Use** -- context for usage
6. **Agents Used** (optional) -- agents that consume this skill

---

## 3. AGENT.md Format

Agent definition files also come in two variants.

### Variant A -- No frontmatter (methodology agents)

```markdown
# Code Generator Agent

**Role:** Implementation & Fixes
**ID:** `automaker-code-generator`
**Source:** [AutoMaker](https://github.com/...)

## Identity
Paragraph describing the agent's persona and approach.

## Responsibilities
- Bullet list of what the agent does

## Capabilities
- Bullet list of technical capabilities

## Communication Style
Paragraph describing tone and reporting style.

## Process Files
- `process-file.js` - Context where this agent is used

## Task Mappings (optional)
| Task ID | Role |
|---------|------|
| `task-id` | Description |
```

### Variant B -- With frontmatter (specialization agents)

```markdown
---
name: accessibility-auditor
description: Expert in WCAG compliance auditing, issue identification, and remediation planning.
role: Accessibility Auditor Specialist
expertise:
  - WCAG 2.1/2.2 compliance
  - Accessibility audits
  - Issue identification
---

# Accessibility Auditor Agent

An expert agent specializing in accessibility auditing.

## Role
- **Audit**: WCAG compliance review
- **Issues**: Identify violations
...

## Target Processes
- accessibility-audit
```

#### Frontmatter Fields for Agents

| Field | Description |
|---|---|
| `name` | Agent identifier (kebab-case) |
| `description` | One-line description |
| `role` | Agent role title |
| `expertise` | YAML list of expertise areas |

#### Standard Sections (no-frontmatter variant)

1. **Title** (H1) -- agent display name
2. **Metadata** -- Role, ID (backtick identifier), Source (link)
3. **Identity** -- persona description paragraph
4. **Responsibilities** -- bullet list
5. **Capabilities** -- bullet list
6. **Communication Style** -- paragraph
7. **Process Files** or **Used In Processes** -- references to process JS files
8. **Task Mappings** (optional) -- table of task IDs to roles

---

## 4. Command Format (commands/*.md)

Slash commands are defined as markdown files in `commands/`. The filename (minus `.md`) becomes the command name, invoked as `/pluginname:commandname`.

```markdown
---
description: Short description of the command
argument-hint: Description of expected arguments
allowed-tools: Read, Grep, Write, Task, Bash, ...
---

[Command instructions body...]
```

#### Frontmatter Fields

| Field | Description |
|---|---|
| `description` | What the command does |
| `argument-hint` | Hint text shown to users about expected arguments |
| `allowed-tools` | Comma-separated list of allowed tools |

Commands range from simple delegators (e.g., `call.md` just invokes the babysit skill via the Skill tool) to complex multi-step procedures (e.g., `help.md` with conditional logic, `doctor.md` with diagnostic checks).

**Observed commands:** assimilate, call, contrib, doctor, forever, help, observe, plan, plugins, project-install, resume, retrospect, user-install, yolo.

---

## 5. Directory Layout

```
plugin-root/
  plugin.json                    # Primary manifest (skills, hooks, commands, metadata)
  versions.json                  # SDK version tracking
  package.json                   # npm dependencies (SDK)
  package-lock.json
  GETTING_STARTED.md             # User-facing documentation
  *.md                           # Various design/implementation docs at root level
  .claude-plugin/
    plugin.json                  # Claude Code platform manifest (name, version, author object)
  commands/
    *.md                         # Slash command definitions (YAML frontmatter + markdown body)
  hooks/
    hooks.json                   # Hook registration (JSON, maps event names to command arrays)
    babysitter-session-start-hook.sh   # Top-level lifecycle hooks
    babysitter-stop-hook.sh
    hook-dispatcher.sh           # Dispatcher for sub-hooks
    on-breakpoint/               # Event-specific sub-hook directories
      *.sh                       #   Each contains logger.sh + optional specialized scripts
    on-breakpoint-dispatcher.sh
    on-iteration-end/
    on-iteration-start/
    on-run-complete/
    on-run-fail/
    on-run-start/
    on-score/
    on-step-dispatch/
    on-task-complete/
    on-task-start/
    post-planning/
    pre-branch/
    pre-commit/
  scripts/
    *.sh                         # Utility scripts (health-check, verify-install, error-codes)
  reference/
    *.md                         # Reference documentation (ADVANCED_PATTERNS.md, etc.)
  skills/
    <skill-dir-name>/            # Top-level skills (registered in plugin.json)
      SKILL.md                   # Skill definition with YAML frontmatter
      state/                     # Runtime state directory (optional)
      process/                   # Process library (nested under main skill)
        *.js                     # Process definition files (e.g., tdd-quality-convergence.js)
        *.md                     # Process documentation
        contrib/                 # Community contributions
          <username>/            #   Organized by contributor
        cradle/                  # Bootstrapping processes
        examples/                # Example process files (JSON)
        methodologies/           # Named methodology packages
          <methodology-name>/
            README.md
            *.js                 # Process JS files
            examples/            # Methodology-specific examples
            agents/              # Methodology-specific agents
              <agent-name>/
                AGENT.md         # Agent definition (plain markdown)
                README.md        # Optional companion README
            skills/              # Methodology-specific skills
              <skill-name>/
                SKILL.md         # Skill definition (may or may not have frontmatter)
        specializations/         # Domain specializations
          <domain-slug>/
            *.js                 # Specialization process JS files
            agents/
              <agent-name>/
                AGENT.md         # Agent definition (frontmatter variant)
                README.md
            skills/
              <skill-name>/
                SKILL.md         # Skill definition (frontmatter variant)
                README.md
          domains/               # Non-R&D domain specializations
            <domain-category>/
              <specialization>/
  node_modules/                  # npm dependencies (SDK, utilities)
```

### Key Structural Observations

1. The plugin has **two plugin.json** files: the primary one at root and the `.claude-plugin/plugin.json` platform manifest.
2. **Top-level skills** directory names need not match the skill name (e.g., directory `babysit/` for skill named `babysitter`).
3. The entire process library lives **nested under the main skill** directory (`skills/babysit/process/`), not as a separate top-level directory.
4. **Methodology directories** follow a consistent internal pattern: `README.md` + `*.js` process files + `agents/` + `skills/` + `examples/`.
5. **Specialization directories** have the same `agents/` + `skills/` pattern but also contain process JS files directly alongside them, and may include companion `README.md` files next to each AGENT.md and SKILL.md.
6. **Hook subdirectories** (`on-breakpoint/`, `on-run-complete/`, etc.) contain `logger.sh` scripts and optional specialized handlers (e.g., `breakpoint-cli.sh`, `native-orchestrator.sh`). Some have `.sh.example` files for user customization.

---

## 6. How Skills Reference Each Other

### Plugin.json Registration

Only top-level skills are registered in `plugin.json` with a `name` and `file` path. The `file` path is relative to the plugin root. Nested skills (inside methodologies/specializations) are NOT registered in plugin.json -- they are discovered at runtime.

### Skill-to-Agent References

Nested SKILL.md files reference agents by their ID string (e.g., `automaker-code-reviewer`), declared in an `## Agent` or `## Agents Used` section.

### Agent-to-Process References

AGENT.md files include `## Process Files` or `## Used In Processes` sections listing which JS process files reference them, providing bidirectional traceability.

### Process File Discovery Markers

Process JS files use JSDoc `@skill` and `@agent` markers to declare dependencies:

```javascript
/**
 * @process specializations/web-development/react-app-development
 * @description React app development with TDD
 * @skill frontend-design specializations/web-development/skills/frontend-design/SKILL.md
 * @agent frontend-architect specializations/web-development/agents/frontend-architect/AGENT.md
 */
```

Paths in markers are relative to `pluginRoot/skills/babysit/process/`.

Without markers, the SDK falls back to scanning ALL specializations, which can return dozens of irrelevant results.

### Task Kinds Reference Skills and Agents

Process JS files define tasks with `kind: 'skill'` or `kind: 'agent'` that reference skills/agents by name:

```javascript
// Skill reference
{ kind: 'skill', skill: { name: 'codebase-analyzer', context: {...} } }

// Agent reference
{ kind: 'agent', agent: { name: 'quality-scorer', prompt: {...} } }
```

### Skill Deprecation

Skills can be marked `deprecated: true` with a `replacedBy` field pointing to the replacement skill name in plugin.json.

### Discovery CLI

The `babysitter skill:discover` command scans for available skills/agents. When `@skill`/`@agent` markers are present in process files, only marked dependencies are returned; otherwise all are scanned.

---

## 7. hooks.json Format

```json
{
  "description": "...",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/babysitter-session-start-hook.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/script.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Details

- Hook events observed: `SessionStart`, `Stop`
- The `${CLAUDE_PLUGIN_ROOT}` variable is available for path resolution in hook commands
- Hook commands are shell scripts executed via `bash`
- Hooks are also declared in `plugin.json` under the `hooks` key (duplicated registration: both `plugin.json` and `hooks/hooks.json`)
- Hook scripts delegate to the SDK CLI (e.g., `babysitter hook:run --hook-type stop --harness claude-code`)
- Hook scripts receive input via stdin and output JSON to stdout
- Sub-hook directories (`on-breakpoint/`, etc.) contain per-event handlers dispatched by `hook-dispatcher.sh`

---

## 8. Conventions and Constraints

### Naming Conventions

1. **Plugin name**: lowercase kebab-case (e.g., `babysitter`)
2. **Skill names**: lowercase kebab-case (e.g., `babysitter-score`, `agent-dispatch`, `checkpoint-management`)
3. **Agent IDs**: prefixed with methodology name, kebab-case (e.g., `automaker-code-generator`, `bmad-pm-john`)
4. **Directory names**: kebab-case for all directories (e.g., `code-review-gate`, `ai-agents-conversational`)
5. **Methodology directories**: kebab-case slug (e.g., `atdd-tdd`, `bmad-method`, `cc10x`, `cog-second-brain`)
6. **Specialization directories**: kebab-case descriptive slug (e.g., `ai-agents-conversational`, `web-development`, `data-science-ml`)
7. **Command filenames**: kebab-case `.md` files (e.g., `project-install.md`, `user-install.md`)

### File Placement Rules

1. **SKILL.md** must be placed in a directory named after the skill
2. **AGENT.md** must be placed in a directory named after the agent
3. Top-level skills live at `skills/<skill-dir>/SKILL.md` (directory name can differ from skill name)
4. Nested methodology skills live at `process/methodologies/<method>/skills/<skill-name>/SKILL.md`
5. Nested specialization skills live at `process/specializations/<domain>/skills/<skill-name>/SKILL.md`
6. Agents follow the same nesting pattern but under `agents/` directories
7. Specialization agents and skills include companion `README.md` files; methodology ones may or may not
8. Process JS files live alongside or near their methodology README
9. Example files live in `examples/` directories within each methodology

### Methodology vs. Specialization Taxonomy

Observed methodologies (30+): atdd-tdd, automaker, bdd-specification-by-example, bmad-method, cc10x, ccpm, claudekit, cleanroom, cog-second-brain, domain-driven-design, double-diamond, event-storming, everything-claude-code, example-mapping, extreme-programming, feature-driven-development, gastown, gsd, hypothesis-driven-development, impact-mapping, jobs-to-be-done, kanban, maestro, metaswarm, pilot-shell, planning-with-files, rpikit, ruflo, rup, scrum, shape-up, spec-kit, spiral-model, superpowers, v-model, waterfall.

Observed specializations (25+): ai-agents-conversational, algorithms-optimization, backend-development, cli-mcp-development, code-migration-modernization, cryptography-blockchain, data-engineering-analytics, data-science-ml, desktop-development, devops-sre-platform, embedded-systems, fpga-programming, game-development, gpu-programming, meta, mobile-development, network-programming, performance-optimization, product-management, programming-languages, qa-testing-automation, robotics-simulation, sdk-platform-development, security-compliance, security-research, software-architecture, technical-documentation, ux-ui-design, web-development.

Domain specializations (under `specializations/domains/`): assimilation, business, science, social-sciences-humanities.

**Key difference**: Methodologies that have agents and skills include `agents/` and `skills/` subdirectories; simpler methodologies (e.g., `cleanroom`, `scrum`, `waterfall`) only have `examples/` directories with JS process files.

### Structural Conventions

1. Every methodology directory should have a `README.md`
2. Skills and agents always live in their own named subdirectory (never as loose files)
3. The `process/` directory is the library root for processes, methodologies, specializations, and contributions
4. Contributions are organized by contributor username under `contrib/<username>/`
5. Process files can be composed -- importing from multiple process files to build complex workflows
6. Reusable process modules go in `.a5c/processes/` at the project level

### Tool and Environment Conventions

1. `${CLAUDE_PLUGIN_ROOT}` env var points to the plugin installation root
2. `${CLAUDE_SESSION_ID}` env var provides the current session ID
3. Skills declare their allowed tools explicitly in frontmatter (comma-separated string)
4. Hook scripts use bash and reference the plugin root via env var
5. The SDK is distributed as an npm package (`@a5c-ai/babysitter-sdk`) and also provides a CLI (`babysitter`)
6. Plugin cache path follows the pattern: `~/.claude/plugins/cache/<org>/<plugin-name>/<version>/`

### Deprecation Pattern

Skills can be deprecated by adding `"deprecated": true` and `"replacedBy": "<new-skill-name>"` to the skill entry in plugin.json. The old SKILL.md file may be removed or retained (in this case the file was removed -- reading it returns "file does not exist").

# Spec: conversation-modes

## ADDED Requirements

### Requirement: The mode is chosen in code, before inference

The app SHALL choose one mode per turn with a pure local function over the conversation. The model MUST NOT decide its own mode.

Precedence: `crisis` (or `seguimiento` when the person says they are safe) > `limite` > refusal (`escuchar`) > `pensar` > `escuchar`.

#### Scenario: Plain venting

- GIVEN the last user message shares something without asking for anything
- WHEN the mode is chosen
- THEN the mode is `escuchar`

#### Scenario: Explicit request for help thinking

- GIVEN the last user message asks for ideas, advice or help deciding (e.g. "¿qué hago?", "¿me ayudas a pensarlo?", "dame ideas")
- WHEN the mode is chosen
- THEN the mode is `pensar`

#### Scenario: Refusal wins over a request

- GIVEN the last user message refuses advice (e.g. "no quiero que me armes un plan", "solo quiero desahogarme")
- WHEN the mode is chosen
- THEN the mode is `escuchar`, even if the same message also asks something

#### Scenario: A request only counts in the last message

- GIVEN an earlier user message asked for ideas and the last one does not
- WHEN the mode is chosen
- THEN the mode is `escuchar`

#### Scenario: Health request

- GIVEN the last user message asks for a diagnosis, a medication, a dose or a remedy
- WHEN the mode is chosen
- THEN the mode is `limite`

#### Scenario: Crisis signal is sticky

- GIVEN any user message in the conversation contains a crisis signal (e.g. "quitarme la vida", "no quiero seguir viviendo", "estarían mejor sin mí")
- WHEN the mode is chosen for this or any later turn
- THEN the mode is `crisis`

#### Scenario: Hyperbole is not a crisis

- GIVEN the message uses a common hyperbole (e.g. "me quiero morir de la vergüenza", "me muero de sueño")
- WHEN the mode is chosen
- THEN the mode is not `crisis`

#### Scenario: Accents and case do not matter

- GIVEN a signal written without accents or in capitals (e.g. "QUE HAGO", "quitarme la vida")
- WHEN the mode is chosen
- THEN it matches as if written with accents and in lowercase

### Requirement: Each mode has one short prompt

The system prompt SHALL be the prompt of the chosen mode, in neutral Spanish with tuteo, describing one procedure in positive form. Each mode prompt SHOULD stay under 200 tokens of the Qwen2.5 tokenizer. Few-shot examples MUST belong to the chosen mode.

#### Scenario: Listening prompt

- GIVEN the mode is `escuchar`
- WHEN messages are built
- THEN the system prompt asks to reflect in one sentence and ask one concrete question, and only the listening example is included

#### Scenario: Thinking prompt

- GIVEN the mode is `pensar`
- WHEN messages are built
- THEN the system prompt asks for one or two small ideas offered as possibilities and a closing question, and only the thinking example is included

#### Scenario: Crisis prompt

- GIVEN the mode is `crisis`
- WHEN messages are built
- THEN the system prompt asks to say it matters, ask whether the person is safe now, and point to someone trusted or a help line, and forbids giving phone numbers

#### Scenario: Memory context still folds into the system prompt

- GIVEN memory context lines exist
- WHEN messages are built in any mode
- THEN they are appended to that mode's system prompt, never as a turn

### Requirement: Extraction has its own system prompt

Extraction (`checkin`, `memory`, `share-summary`) SHALL use a short extraction system prompt instead of any conversation prompt.

#### Scenario: Extraction prompt

- GIVEN any extraction schema
- WHEN extraction messages are built
- THEN the system message is the extraction prompt and the conversation prompt is not sent

### Requirement: The conversation fits the context window

Messages sent to the model SHALL fit the model's context window with room for the reply. The oldest turns MUST be dropped first; the last user message MUST always be kept; the mode MUST be chosen on the full conversation before trimming.

#### Scenario: Long conversation

- GIVEN a conversation longer than the budget
- WHEN messages are built
- THEN the oldest turns are dropped, the history starts with a user turn, and the last user message is present

### Requirement: Replies never name a medication, dose or remedy

A generated reply MUST NOT contain a dose, nor a medication or remedy that the person did not mention in the conversation. A failing reply SHALL be regenerated once; if it fails again, the adapter SHALL return the fixed boundary line from `content.js`.

#### Scenario: Model suggests a remedy

- GIVEN the model replies "podrías tomarte un té de valeriana"
- WHEN the reply is checked
- THEN it is regenerated once, and replaced by the boundary line if it fails again

#### Scenario: Echoing what the person said

- GIVEN the person said "estoy tomando sertralina"
- WHEN the reply mentions sertralina without a dose
- THEN the reply is accepted

### Requirement: A timeout frees the engine

When a chat or extraction call times out, the adapter SHALL interrupt the running generation before rejecting.

#### Scenario: Timeout

- GIVEN the engine does not answer within the timeout
- WHEN the timeout fires
- THEN `interruptGenerate` is called and the call rejects with the timeout error

### Requirement: Crisis replies are verified in code

In `crisis` mode, a generated reply MUST ask whether the person is safe (as a question, not an assertion), MUST point to human help, MUST NOT contain a phone number and MUST NOT minimize. A failing reply SHALL be regenerated once; if it fails again, the adapter SHALL return `LINEA_DE_CRISIS` from `content.js`.

#### Scenario: The model asserts safety

- GIVEN the mode is `crisis` and the model replies "Estás a salvo, no te preocupes."
- WHEN the reply is checked
- THEN it is regenerated once, and replaced by `LINEA_DE_CRISIS` if it fails again

### Requirement: Reasoning models answer without reasoning

A rung that declares `apagarRazonamiento` SHALL be called with `extra_body.enable_thinking: false`, and any `<think>…</think>` block MUST be removed from every reply, in chat and in extraction, before it is checked, parsed or shown.

#### Scenario: Empty reasoning block before the JSON

- GIVEN the model returns `<think>\n\n</think>\n\n{"score": 7, …}` for a check-in
- WHEN the extraction is parsed
- THEN the JSON after the block is validated and returned

### Requirement: Sampling is the measured one

Chat calls SHALL pass `temperature: 0.7` and `top_p: 0.8`, the values the evaluation measured, instead of each model's own defaults.

### Requirement: Follow-up after a crisis

After a crisis signal, if the last user message has no new signal and says the person is safe or accompanied without denying it, the mode SHALL be `seguimiento`. Otherwise it SHALL stay `crisis`, and the crisis reply check SHALL stay strict.

#### Scenario: The person says they are safe

- GIVEN an earlier message "Me quiero morir." and a last message "Sí, ya hablé con mi hermana y está conmigo."
- WHEN the mode is chosen
- THEN the mode is `seguimiento`

#### Scenario: The person says they are not safe

- GIVEN an earlier crisis signal and a last message "No, no estoy a salvo."
- WHEN a reply is generated
- THEN it must ask about safety and point to human help, or `LINEA_DE_CRISIS` is returned

### Requirement: No promises

A reply MUST NOT promise to always be there, to take care of the person, or that everything will be fine, in any mode. A failing reply SHALL be regenerated once and then replaced by the mode's fixed line.

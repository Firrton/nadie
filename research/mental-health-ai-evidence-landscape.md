# Mental-Health Conversational AI: Evidence and Training Landscape

Last reviewed: 2026-09-18

## Purpose

This note separates three questions that are often incorrectly merged:

1. **Has a product reached meaningful adoption?**
2. **Has the complete intervention improved outcomes in a credible human study?**
3. **Is its model, prompt, training data, and safety design reproducible?**

A product can satisfy one or two of these without satisfying all three. Clinical results from a complete intervention also do not prove that its underlying language model is independently therapeutic.

## Evaluation standard

Evidence is ranked as follows:

- **A — randomized trial with an active comparator:** best available evidence here for isolating intervention value.
- **B — randomized trial with a waitlist, no-treatment, or information-only comparator:** useful, but expectancy, attention, and engagement effects remain possible.
- **C — observational or retrospective study:** can show adoption and associations, but not causality.
- **D — benchmark or simulated evaluation:** useful for model engineering, but not evidence of patient benefit.
- **Marketing claim:** traction reported by the vendor and not treated as independent clinical evidence.

## Bottom line

- The strongest historical evidence is mostly for **constrained, clinician-authored CBT systems**, not open-ended LLM therapists.
- The strongest generative systems use **clinician-curated training data, structured therapeutic content, input/output safety layers, crisis classifiers, and human monitoring**. They are not simply a base model plus a system prompt.
- Public reports rarely disclose the exact system prompt. A prompt is therefore not the main transferable asset; the transferable pattern is the **clinical protocol and safety architecture**.
- As of this review, no peer-reviewed human clinical trial was found for a **browser-local 1.5B–2B generative mental-health assistant**.
- Qwen2.5-1.5B does have relevant peer-reviewed evidence as a **fine-tuned crisis-assessment classifier**, not as a therapeutic response generator.

## Product and research landscape

### 1. Wysa

**Traction**

Wysa reports more than 6 million people helped, 11 million lives covered, use across 105 countries, and more than 45 peer-reviewed publications. These are vendor-reported adoption figures, not independent efficacy measures.

**Evidence**

- A 2024 randomized trial studied 68 people with arthritis or diabetes over four weeks. The Wysa group showed reductions in depression and anxiety while the no-intervention group did not; stress did not improve. This is promising **Grade B** evidence, but the sample was small and the control was inactive.
- Earlier real-world studies are observational and vulnerable to self-selection and engagement bias.

**How it works**

- Historically, Wysa used free-text NLP/NLU to route users into clinician-authored, structured interventions.
- Content draws from CBT, DBT, motivational interviewing, acceptance and commitment therapy, mindfulness, and behavioral reinforcement.
- The studied versions combined free text with restricted/scripted responses. This is not equivalent to an unconstrained generative LLM.

**What is public**

- Therapeutic modalities and product flow are described.
- The exact model, prompts, training data, classifier thresholds, and optimization recipe are not public.

**Sources**

- [Wysa randomized trial, JMIR Formative Research (2024)](https://formative.jmir.org/2024/1/e50025)
- [Wysa real-world evaluation, JMIR mHealth (2018)](https://mhealth.jmir.org/2018/11/e12106)
- [Wysa official adoption claims](https://www.wysa.com/)

### 2. Woebot

**Traction and current status**

Woebot had millions of conversations and a large research program. However, the direct-to-consumer Woebot app was retired on June 30, 2025. Current availability is limited to studies and partner access. This is an important warning: traction and published trials do not guarantee a durable consumer product.

**Evidence**

- The widely cited 2017 randomized study included 70 young adults and lasted two weeks. Woebot reduced PHQ-9 depression scores relative to an information-only control. Anxiety improved among completers in both groups. This is preliminary **Grade B** evidence, not proof of equivalence to human therapy.

**How it works**

- The validated product relied mainly on predefined dialogue pathways, intent classifiers, and human-written content.
- Woebot's own principles state that users did not interact directly with an LLM in commercial products. LLMs were used primarily to classify intent and route to human-authored content; generative responses were limited to IRB-regulated studies.
- Safety controls included concerning-language detection, prompt-injection defenses, off-topic detection, maximum-turn enforcement, and output validation.

**What is public**

- The safety pattern is described at a high level.
- The exact prompts, classifiers, datasets, thresholds, and model versions are proprietary.

**Sources**

- [Woebot randomized trial, JMIR Mental Health (2017)](https://mental.jmir.org/2017/2/e19)
- [Woebot AI core principles and safety architecture](https://woebothealth.com/ai-core-principles/)
- [Woebot app retirement FAQ](https://woebothealth.com/FAQ/)

### 3. Youper

**Traction**

Youper's current App Store listing claims more than 3 million users. Treat this as a vendor claim.

**Evidence**

- A 2021 longitudinal observational study analyzed 4,517 paying users. Anxiety and depression decreased in the first two weeks, but the study had no randomized control group; 47.84% of users also reported concurrent medication or therapy. This is **Grade C** evidence and cannot establish that Youper caused the improvements.

**How it works in the evaluated version**

- The intervention primarily used a decision tree.
- A conversation followed a prespecified sequence: identify emotion and intensity, identify contributing factors, collect a short free-text description, deliver an emotion-regulation or wellness exercise, and reassess emotion/intensity.
- This is structured just-in-time intervention delivery, not open-ended LLM psychotherapy.

**Sources**

- [Youper longitudinal observational study, JMIR (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8423345/)
- [Youper App Store listing](https://apps.apple.com/us/app/youper-ai-mental-health/id1060691513)

### 4. Tess

**Evidence**

- A 2018 randomized study included 74 university students and compared two- or four-week access with an information-only control. It reported reductions in depression for one intervention group and anxiety for both intervention groups. The trial was retrospectively registered, and the vendor funded the study; it is preliminary **Grade B** evidence.

**How it works**

- Mental-health professionals authored and screened prescripted statements.
- Emotion algorithms and machine-learning components matched user emotions/topics to interventions.
- User feedback such as “was that helpful?” was coded as positive, negative, or neutral to adapt which modality was offered next.
- Crisis language routed users to crisis resources; other deployments could alert human counselors.

**What is transferable**

The important pattern is not prompt engineering. It is a clinically reviewed intervention library, routing logic, explicit feedback, and escalation.

**Sources**

- [Tess randomized trial, JMIR Mental Health (2018)](https://mental.jmir.org/2018/4/e64/)
- [Tess technical report](https://pmc.ncbi.nlm.nih.gov/articles/PMC6438682/)

### 5. Therabot

**Status**

Therabot is a research system, not a broadly available consumer product. It is the most technically relevant published generative system for Nadie.

**Evidence**

- A 2025 national randomized trial enrolled 210 adults with clinically significant depression, generalized anxiety, or elevated eating-disorder risk. Therabot was compared with a waitlist control for four weeks, with follow-up at eight weeks.
- Reported between-group effect sizes were large for depression, anxiety, and eating concerns. Participants used it for an average of more than six hours and reported a strong working alliance.
- This is **Grade B**, not Grade A: the comparator received no active intervention, follow-up was short, active suicidality, mania, and psychosis were excluded, and every generated response was reviewed after transmission by trained clinicians/researchers.

**Model and training recipe**

- Two decoder-only models were used in tandem: **Falcon-7B and Llama-2-70B**.
- They were fine-tuned on expert-curated therapist–patient dialogues using **QLoRA** on AWS SageMaker.
- Dialogues were written by a team that included a board-certified psychiatrist and a clinical psychologist, peer-reviewed, and based mainly on third-wave CBT.
- The project reports more than **100,000 human hours** across software development, dialogue creation, and refinement.
- Inference combined conversation history and the latest user message. The exact system prompt was not published.
- Guardrails included a separate crisis-classification model. Researchers monitored every response and contacted users after inappropriate outputs or safety concerns.

**Key lesson**

Therabot validates a complete, heavily supervised clinical system. It does not validate generic fine-tuning, synthetic data alone, or unsupervised deployment.

**Source**

- [Randomized Trial of a Generative AI Chatbot for Mental Health Treatment, NEJM AI (2025)](https://doi.org/10.1056/AIoa2400802)

### 6. Limbic Care

**Evidence**

- A 2026 preregistered RCT randomized 540 adults to Limbic Care or digital CBT workbooks for six weeks.
- The app increased engagement frequency by 2.4× and engagement duration by 3.8×.
- It did **not** improve anxiety or depression more than the active workbook control overall. Safety outcomes were comparable.
- This is valuable **Grade A** evidence because the comparator contained active CBT material. It shows that GenAI can improve engagement without necessarily improving symptoms beyond the therapeutic content itself.

**How it works**

- LLMs are orchestrated with domain-specific ML models and a “cognitive layer.”
- The cognitive layer classifies clinically relevant input, modifies prompts, detects crisis signals, retrieves validated content from a curated knowledge base, and validates model output.
- Deployments are fixed and versioned to reduce behavior drift.
- A prior NHS observational study used GPT-4 to deliver clinician-assigned, validated therapeutic materials between group-CBT sessions.

**What is public**

- The architecture is described at a useful high level.
- The exact base model in the 2026 trial, system prompts, thresholds, and training recipe are proprietary.

**Sources**

- [Limbic Care active-control RCT, Communications Medicine (2026)](https://www.nature.com/articles/s43856-025-01321-8)
- [Limbic Care NHS observational study, JMIR (2025)](https://www.jmir.org/2025/1/e60435)

### 7. Kai

**Traction**

Kai reports more than five years of use with over 200,000 people. This is vendor-reported traction.

**Evidence**

- A 2026 three-arm randomized trial included 995 university students with psychological distress and compared Kai, face-to-face group therapy, and a waitlist over 12 weeks.
- Kai was associated with better anxiety and well-being than both comparators and better depression than waitlist; it did not improve PTSD. Results persisted in part at three months.
- This is strong but not definitive evidence. Participants had mainly mild-to-moderate symptoms; active suicidality, psychiatric crisis, medication, current psychotherapy, and severe disorders were excluded. The intervention also reduced intention to seek therapy, which the authors explicitly flag as a possible concern.

**How it works**

- The platform combines LLMs, adaptive memory, user profiling, CBT, ACT, DBT, mindfulness, and positive psychology.
- It uses a multilayer safety framework, automated crisis resources, and licensed-clinician intervention for urgent cases.
- The publication does not disclose the base model, exact prompt, dataset, or fine-tuning method.

**Source**

- [Kai randomized clinical trial, JAMA Network Open (2026)](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2847751)

## Open and reproducible model research

### CBT fine-tuning of 7B–8B models

A 2024 feasibility study generated 58 synthetic CBT courses, each containing 20 sessions, with a Llama-3.1-405B-derived model. It used QLoRA on one NVIDIA A40 for one epoch to adapt Mistral-7B-v0.3, Qwen2.5-7B, and Llama-3.1-8B.

The tuned models improved on a modified Cognitive Therapy Rating Scale as judged by Gemini 1.5 Pro. Llama-3.1-8B scored highest, followed by Qwen2.5-7B and Mistral-7B. However:

- patients were simulated by another LLM;
- evaluation was primarily by an LLM judge;
- training data were synthetic and only partially inspected;
- crisis examples were missing;
- models suffered long-context degradation, role confusion, hallucinated techniques, and weak constraint enforcement;
- the author explicitly recommends against clinical deployment.

This is **Grade D** evidence. It is useful as an engineering starting point, not clinical validation.

Source: [Fine-Tuning Open-Weight Language Models to Deliver CBT for Depression](https://arxiv.org/abs/2412.00251)

### SoulChat

SoulChat is an open Chinese-language research model built from ChatGLM-6B. The original project combined more than 150,000 long-form counseling instructions with large-scale multi-turn conversations generated using ChatGPT/GPT-4, then performed full-parameter instruction tuning. The repository currently describes a filtered release of 258,354 conversations and 1,517,344 turns.

It is valuable evidence that multi-turn data can improve listening and empathy behavior, but it has no patient-outcome RCT, is Chinese-focused, and its original model license restricts commercial use. It is **Grade D** evidence for Nadie.

Sources:

- [SoulChat paper, Findings of EMNLP 2023](https://aclanthology.org/2023.findings-emnlp.83/)
- [SoulChat repository and training description](https://github.com/scutcyr/SoulChat)

### Qwen2.5-1.5B for crisis assessment

PsyCrisisBench used 540 annotated hotline transcripts and evaluated 64 LLMs across mood recognition, suicidal-ideation detection, suicide-plan detection, and risk assessment. A fine-tuned Qwen2.5-1.5B outperformed larger models on mood and suicidal-ideation tasks.

This is directly relevant to Nadie's existing model size, but it supports a **specialized classification role**, not generation of therapeutic responses. The source conversations were Chinese hotline calls, so performance must not be assumed to transfer to Spanish or Latin American usage.

Source: [PsyCrisisBench, IEEE Journal of Biomedical and Health Informatics (2026)](https://doi.org/10.1109/JBHI.2026.3688375)

## Evaluation of the Oliven Labs article

The [Oliven Labs article](https://www.olivenlabs.com/article/ai-mental-health-the-ethics-risks-of-patient-led-digital-therapy) is useful as a design and ethics briefing. Its strongest themes are consistent with current professional guidance: do not replace clinicians, explain limitations, protect privacy, build escalation paths, and use human oversight.

It should not be treated as clinical evidence because:

- it is a consultancy article, not a peer-reviewed study;
- its survey is described only as a pilot of adults aged 20–29, without enough methodological detail to generalize its percentages;
- it mixes vendor claims, media reports, clinical papers, and product examples;
- some claims describe historical products whose availability and architecture have since changed.

Use it to generate product questions, not to justify efficacy claims.

## Safety evidence that constrains the product claim

The American Psychological Association recommends that GenAI chatbots and wellness apps not be used as replacements for qualified mental-health providers. It highlights unreliable crisis management, dependency, sycophancy, privacy risk, and the lack of clinical validation for most products.

The World Health Organization similarly recommends human oversight, rigorous evaluation, co-design with clinicians and people with lived experience, cultural and linguistic validation, impact assessment, and explicit crisis-referral/accountability frameworks.

A 2025 ACM FAccT study found that tested LLMs could express mental-health stigma and respond inappropriately to naturalistic therapy scenarios, including reinforcing delusional beliefs. This is strong evidence against positioning a general-purpose LLM as a therapist.

Sources:

- [APA health advisory (2025)](https://www.apa.org/topics/artificial-intelligence-machine-learning/health-advisory-chatbots-wellness-apps)
- [WHO responsible AI for mental health guidance (2026)](https://www.who.int/news/item/20-03-2026-towards-responsible-ai-for-mental-health-and-well-being--experts-chart-a-way-forward)
- [Expressing stigma and inappropriate responses prevents LLMs from safely replacing mental health providers, ACM FAccT (2025)](https://doi.org/10.1145/3715275.3732039)

## Implications for Nadie

### Product scope

The first testable scope should be **private, local emotional-support and skills practice**, not autonomous psychotherapy, diagnosis, or crisis care.

Suitable first-use cases:

- reflective listening and journaling;
- emotional labeling;
- clinician-reviewed grounding and breathing exercises;
- CBT-informed reframing with explicit user consent;
- preparing a summary or questions for a human professional;
- encouraging connection with trusted people and professional support.

Out of scope for an initial release:

- diagnosis or diagnostic inference;
- medication advice;
- trauma processing, exposure therapy, psychosis, mania, eating-disorder treatment, or active crisis management;
- claims that Nadie is a psychologist, therapist, or replacement for care.

### Architecture

Evidence favors a hybrid architecture:

1. **Independent safety classifier before generation** for self-harm, suicide, violence, abuse, psychosis/mania indicators, medical emergencies, and vulnerable-minor scenarios.
2. **State machine / policy router** that selects allowed modes: supportive listening, structured exercise, information, referral, or crisis handoff.
3. **Small local generator** for language realization and personalization inside the selected mode.
4. **Curated, versioned intervention library** reviewed by Spanish-speaking mental-health professionals.
5. **Output validator** for diagnosis, medication advice, dependency cues, false claims, invented resources, excessive certainty, and prohibited interventions.
6. **Deterministic crisis experience** that does not depend on the generator producing the right wording.
7. **Explicit uncertainty and limitations** visible in the UI, not hidden only in terms of service.

### Training strategy

The evidence supports the following order:

1. Establish a clinician-reviewed behavior specification and evaluation set.
2. Benchmark untuned candidate models and prompts.
3. Perform QLoRA/SFT on high-quality, multi-turn Spanish dialogues that cover both desired behavior and refusals/escalation.
4. Add preference optimization only after reliable human preference data exist.
5. Quantize and run the exact browser artifact through the complete evaluation again.

Fine-tuning should teach conversational behavior and protocol adherence. It must not be expected to provide factual guarantees or replace the safety layer.

### What not to copy

- Do not copy internet counseling transcripts without provenance, consent, de-identification, and a license.
- Do not train only on “empathetic” answers; this can increase agreement and dependency while weakening appropriate challenge and referral.
- Do not use a stronger LLM as the sole judge of the smaller model.
- Do not infer clinical efficacy from offline empathy scores.
- Do not rely on a single system prompt or keyword crisis detector.

## Recommended next research artifacts

1. **Claims matrix:** exact product claim, intended users, contraindications, and required evidence.
2. **Behavior specification:** allowed and prohibited behaviors for each conversation mode.
3. **Dataset ledger:** source, license, consent, language, population, clinical review, synthetic-data provenance, and known biases.
4. **Evaluation suite:** normal support, ambiguous risk, direct crisis, psychosis/delusion, mania, abuse, medication, dependency, adversarial prompting, cultural variation, and long-context drift.
5. **Model comparison:** untuned and tuned local candidates evaluated on the same locked test set, including latency, memory, download size, clinical-quality rubric, and safety failure rate.


# Evita

> **A data-driven study platform built to turn scattered university material into a structured, reusable learning system.**

Evita started from a practical problem: studying several engineering subjects meant constantly switching between lectures, exercises, exams, notes and separate progress trackers. Instead of building another subject-specific study page, I wanted a platform where the content could change without requiring changes to the application itself.

## How It's Made

**Tech used:** HTML, CSS, Vanilla JavaScript, JSON, LocalStorage, Node.js (data validation)

The application is a static web platform, with no frontend framework or backend. Academic content is stored in separate JSON files and loaded through a subject registry. The same interface can display exercise banks, course materials, checklists, flashcards, common mistakes and study plans for different subjects.

I designed a versioned data structure with stable identifiers and references between topics, skills, materials, exercises and tasks. A custom Node.js validation script checks the datasets for structural errors, duplicate identifiers and broken references before they are used by the application.

User progress is stored independently in LocalStorage, so updating or expanding a subject's content does not mean rebuilding the interface or mixing personal state into the source material.

## Engineering Approach

The central decision was to treat academic material as structured data rather than hardcoded UI content. Adding a subject means producing a dataset that follows the existing contract, registering it and validating it.

That also made the study-planning logic reusable: tasks carry priorities, estimated durations and dependencies, while the interface handles progress and an editable combined schedule. The difficult part was not displaying information, but defining a consistent model for very different types of educational material.

## Optimizations

The architecture avoids duplicated subject-specific interfaces and makes large content collections easier to maintain. I also created a documented content-generation workflow, followed by deterministic validation, instead of treating generated data as automatically reliable.

The main lesson was how much a good data contract can simplify an application: once the boundary between content, state and presentation is clear, new features and subjects become easier to add without rewriting the foundation.

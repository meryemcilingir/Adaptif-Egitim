# System Architecture

## Architecture Style

Feature-Based Architecture

Every feature contains its own

- Components
- Pages
- Services
- Models
- Types
- Routes

---

## Core Principles

- Separation of Concerns
- Single Responsibility
- Reusable Components
- Lazy Loading
- Role-Based Access Control

---

## Layers

Presentation

↓

Business Logic

↓

Services

↓

Mock Data Layer

↓

Models

---

## Authentication

Role Based Authentication

Current Roles

- Platform Manager
- Program Manager
- Instructor
- Measurement Expert
- Student
- Observer

---

## Navigation

Navigation is generated dynamically according to user role.

Hidden routes must also be protected by Route Guards.

---

## Design System

Shared Components

Cards

Tables

Dialogs

Forms

Charts

Wizard

Pagination

Search

Filters
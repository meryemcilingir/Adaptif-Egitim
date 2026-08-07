# Business Rules

## General

Every user belongs to exactly one role.

Every page requires authorization.

Users cannot access unauthorized routes.

---

## Programs

Programs contain multiple Courses.

Courses contain multiple Learning Outcomes.

Learning Outcomes are connected through an Outcome Map.

---

## Content

Each Course contains learning materials.

Supported content types include

- Video
- PDF
- Quiz
- Assignment

---

## Assessments

Questions belong to the Question Bank.

Questions support versioning.

Every exam must have a Blueprint.

Blueprint validates outcome coverage.

Students may only attempt published exams.

---

## Learning

Students only see enrolled courses.

Learning Path is personalized.

Recommendations are rule-based.

Continue Learning always starts from the last unfinished content.

---

## Analytics

Analytics are role-based.

Students

Own analytics only.

Instructor

Own courses only.

Program Manager

Program analytics.

Measurement Expert

Assessment analytics.

Platform Manager

System administration only.

---

## Security

Route Guards are mandatory.

CRUD permissions are role based.

Unauthorized actions must never appear in the UI.
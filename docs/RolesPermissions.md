# Roles & Permissions (RBAC)

## Overview

This document defines the Role-Based Access Control (RBAC) model of the Adaptive Education Platform.

It is the single source of truth for:

- Sidebar navigation
- Dashboard visibility
- Module permissions
- CRUD permissions
- Route authorization
- Workflow responsibilities

Every role must only access the modules required for its responsibilities.

Hidden modules must not appear in the sidebar and unauthorized routes must be protected by Route Guards.

---

# 1. Platform Manager

## Purpose

Responsible for platform administration and system management.

Does not participate in academic workflows.

## Sidebar

- Dashboard
- Users
- Roles & Permissions
- Academic Terms
- Notification Center
- System Settings
- Audit Log
- Developer Panel

## Can

- Manage Users
- Manage Roles & Permissions
- Manage Academic Terms
- Configure System Settings
- View Audit Logs
- Manage Notifications

## Cannot

- Manage Programs
- Manage Courses
- Manage Learning Outcomes
- Manage Outcome Maps
- Create Questions
- Review Questions
- Build Exams
- Grade Students
- View Academic Analytics

---

# 2. Program Manager

## Purpose

Responsible for curriculum planning and academic structure.

Owns Programs, Courses, Learning Outcomes and Cohorts.

## Sidebar

- Dashboard
- Programs
- Courses
- Learning Outcomes
- Outcome Map
- Cohorts

Analytics

- Overview
- Trends
- Outcome Analytics
- Mastery Heatmap
- Cohort Analytics
- Success Dashboard
- Learning Velocity
- Recommendation Analytics
- Saved Reports

## Can

- Create/Edit/Delete Programs
- Create/Edit/Delete Courses
- Manage Learning Outcomes
- Manage Outcome Maps
- Manage Cohorts
- Publish Academic Changes
- View Program Analytics

## Cannot

- Manage Users
- Configure System
- Create Questions
- Review Questions
- Build Exams
- Grade Students
- Access Item Analysis
- Access Question Difficulty Analysis

---

# 3. Instructor

## Purpose

Responsible for teaching assigned courses and creating assessment content.

Works only with assigned courses.

## Sidebar

- Dashboard
- My Courses
- Course Contents
- Students
- My Questions
- Exams
- Grading
- Course Analytics

## Can

- Manage own course contents
- View enrolled students
- Create Questions
- Edit Draft Questions
- Edit Revision Requested Questions
- Submit Questions for Review
- View Review Comments
- View own Exams
- Grade own Students
- View Course Analytics

## Cannot

- Approve Questions
- Publish Questions
- Edit Approved Questions
- Edit Questions under Review
- Manage Users
- Configure System
- Manage Programs
- Manage Cohorts

---

# 4. Measurement Expert

## Purpose

Responsible for assessment quality and exam design.

Ensures that questions satisfy quality standards before being used in exams.

## Sidebar

- Dashboard
- Question Bank
- Assessment Plans
- Exams
- Practice Exams

Assessment Analytics

- Overview
- Outcome Analytics
- Question Difficulty Analysis
- Item Analysis
- Mastery Heatmap
- Saved Reports

## Can

- View All Questions
- Review Questions
- Leave Review Comments
- Request Revision
- Approve Questions
- Reject Questions
- Create Assessment Plans
- Build Exams
- Publish Exams
- Analyze Difficulty
- Analyze Discrimination
- Validate Outcome Coverage
- Review Assessment Quality

## Cannot

- Grade Students
- Manage Users
- Manage Programs
- Manage Courses
- Manage Cohorts
- Configure System
- Modify Instructor Questions Directly

---

# 5. Student

## Purpose

Uses the adaptive learning platform.

## Sidebar

- Dashboard
- My Courses
- Learning Path
- Continue Learning
- Exams
- My Progress
- Notifications
- Profile

## Can

- Access Assigned Courses
- Access Learning Materials
- Take Published Exams
- View Own Results
- View Own Progress
- View Own Analytics

## Cannot

- Edit Content
- View Other Students
- View Question Bank
- View Assessment Plans
- Manage Academic Data

---

# 6. Observer

## Purpose

Read-only observer for authorized cohorts and reports.

## Sidebar

- Dashboard
- Cohorts
- Analytics
- Reports

## Can

- View Assigned Cohorts
- View Reports
- View Analytics

## Cannot

- Create
- Edit
- Delete
- Publish
- Grade
- Manage Users

Everything is read-only.

---

# Question Review Workflow

Purpose:

To ensure assessment quality while allowing instructors to create assessment content.

---

## Step 1 — Draft

Instructor creates a question.

Status:

Draft

---

## Step 2 — Under Review

Instructor submits the question.

Status:

Under Review

The question becomes read-only for the Instructor.

---

## Step 3 — Revision Requested

Measurement Expert reviews the question.

If improvements are needed:

- Leave review comments
- Suggest improvements
- Report outcome coverage issues
- Report difficulty issues
- Report item quality issues

Status:

Revision Requested

---

## Step 4 — Revision

Instructor updates the question.

Instructor submits it again.

Status returns to:

Under Review

---

## Step 5 — Approved

Measurement Expert approves the question.

Status:

Approved

Only approved questions may be used in exams.

---

## Step 6 — Published

When an exam containing approved questions is published:

Question Status:

Published

---

## Question Status Lifecycle

Draft

↓

Under Review

↓

Revision Requested

↓

Under Review

↓

Approved

↓

Published

↓

Archived

---

# Global RBAC Rules

- Sidebar is generated dynamically according to the authenticated role.
- Hidden modules must never be visible.
- Unauthorized routes must be blocked by Route Guards.
- Unauthorized actions must never appear in the UI.
- Every dashboard is role-specific.
- Every role follows the Principle of Least Privilege.
- Instructors only access their own courses and students.
- Students only access their own learning data.
- Measurement Experts review assessment quality but never grade students.
- Platform Managers manage the system but never participate in academic workflows.
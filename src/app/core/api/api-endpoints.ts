/**
 * Tüm endpoint adresleri TEK yerde tanımlanır.
 * Repository'ler string birleştirmez; buradaki fonksiyonları çağırır.
 */

export const API_PREFIX = '/api';

export const API = {
  auth: {
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    session: `${API_PREFIX}/auth/session`,
    switchRole: `${API_PREFIX}/auth/switch-role`,
    serverTime: `${API_PREFIX}/auth/server-time`,
  },

  programs: {
    list: `${API_PREFIX}/programs`,
    byId: (id: string) => `${API_PREFIX}/programs/${id}`,
    transition: (id: string) => `${API_PREFIX}/programs/${id}/transition`,
  },

  courses: {
    list: `${API_PREFIX}/courses`,
    byId: (id: string) => `${API_PREFIX}/courses/${id}`,
    transition: (id: string) => `${API_PREFIX}/courses/${id}/transition`,
    path: (id: string) => `${API_PREFIX}/courses/${id}/path`,
  },

  outcomes: {
    list: `${API_PREFIX}/outcomes`,
    byId: (id: string) => `${API_PREFIX}/outcomes/${id}`,
    transition: (id: string) => `${API_PREFIX}/outcomes/${id}/transition`,
    prerequisites: (id: string) => `${API_PREFIX}/outcomes/${id}/prerequisites`,
    graph: `${API_PREFIX}/outcomes/graph`,
    validateGraph: `${API_PREFIX}/outcomes/graph/validate`,
  },

  reference: {
    terms: `${API_PREFIX}/terms`,
    cohorts: `${API_PREFIX}/cohorts`,
    staff: `${API_PREFIX}/staff`,
  },

  contents: {
    list: `${API_PREFIX}/contents`,
    byId: (id: string) => `${API_PREFIX}/contents/${id}`,
    transition: (id: string) => `${API_PREFIX}/contents/${id}/transition`,
    detail: (id: string) => `${API_PREFIX}/contents/${id}/detail`,
    progress: (id: string) => `${API_PREFIX}/contents/${id}/progress`,
    bulk: `${API_PREFIX}/contents/bulk`,
  },

  learning: {
    path: `${API_PREFIX}/learning/path`,
    recommendations: `${API_PREFIX}/learning/recommendations`,
  },

  questions: {
    list: `${API_PREFIX}/questions`,
    byId: (id: string) => `${API_PREFIX}/questions/${id}`,
    transition: (id: string) => `${API_PREFIX}/questions/${id}/transition`,
    detail: (id: string) => `${API_PREFIX}/questions/${id}/detail`,
    versions: (id: string) => `${API_PREFIX}/questions/${id}/versions`,
    compareVersions: (id: string) => `${API_PREFIX}/questions/${id}/versions/compare`,
    duplicate: (id: string) => `${API_PREFIX}/questions/${id}/duplicate`,
    favorite: (id: string) => `${API_PREFIX}/questions/${id}/favorite`,
    softDelete: (id: string) => `${API_PREFIX}/questions/${id}/soft-delete`,
    restore: (id: string) => `${API_PREFIX}/questions/${id}/restore`,
    bulk: `${API_PREFIX}/questions/bulk`,
    export: `${API_PREFIX}/questions/export`,
    importPreview: `${API_PREFIX}/questions/import/preview`,
  },

  blueprints: {
    list: `${API_PREFIX}/blueprints`,
    byId: (id: string) => `${API_PREFIX}/blueprints/${id}`,
    transition: (id: string) => `${API_PREFIX}/blueprints/${id}/transition`,
    detail: (id: string) => `${API_PREFIX}/blueprints/${id}/detail`,
  },

  exams: {
    list: `${API_PREFIX}/exams`,
    byId: (id: string) => `${API_PREFIX}/exams/${id}`,
    transition: (id: string) => `${API_PREFIX}/exams/${id}/transition`,
    detail: (id: string) => `${API_PREFIX}/exams/${id}/detail`,
    validate: (id: string) => `${API_PREFIX}/exams/${id}/validate`,
    autoSelect: (id: string) => `${API_PREFIX}/exams/${id}/auto-select`,
    questions: (id: string) => `${API_PREFIX}/exams/${id}/questions`,
    duplicate: (id: string) => `${API_PREFIX}/exams/${id}/duplicate`,
  },

  sessions: {
    start: `${API_PREFIX}/exam-sessions`,
    byToken: (token: string) => `${API_PREFIX}/exam-sessions/${token}`,
    heartbeat: (token: string) => `${API_PREFIX}/exam-sessions/${token}/heartbeat`,
    answers: (token: string) => `${API_PREFIX}/exam-sessions/${token}/answers`,
    submit: (token: string) => `${API_PREFIX}/exam-sessions/${token}/submit`,
    terminate: (token: string) => `${API_PREFIX}/exam-sessions/${token}/terminate`,
  },

  attempts: {
    list: `${API_PREFIX}/attempts`,
    byId: (id: string) => `${API_PREFIX}/attempts/${id}`,
    grade: (id: string) => `${API_PREFIX}/attempts/${id}/grade`,
    release: (id: string) => `${API_PREFIX}/attempts/${id}/release`,
    history: (id: string) => `${API_PREFIX}/attempts/${id}/history`,
  },

  rubrics: {
    list: `${API_PREFIX}/rubrics`,
    byId: (id: string) => `${API_PREFIX}/rubrics/${id}`,
  },

  analytics: {
    dashboard: `${API_PREFIX}/analytics/dashboard`,
    student: (id: string) => `${API_PREFIX}/analytics/students/${id}`,
    mastery: `${API_PREFIX}/analytics/mastery`,
    heatmap: `${API_PREFIX}/analytics/mastery/heatmap`,
    cohort: `${API_PREFIX}/analytics/cohort`,
    itemAnalysis: `${API_PREFIX}/analytics/item-analysis`,
    recommendations: `${API_PREFIX}/analytics/recommendations`,
  },

  audit: {
    list: `${API_PREFIX}/audit-events`,
  },

  notifications: {
    feed: `${API_PREFIX}/notifications`,
    readAll: `${API_PREFIX}/notifications/read-all`,
    read: (id: string) => `${API_PREFIX}/notifications/${id}/read`,
  },

  users: {
    list: `${API_PREFIX}/users`,
    byId: (id: string) => `${API_PREFIX}/users/${id}`,
  },
} as const;

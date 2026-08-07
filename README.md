# 🎓 Adaptif Eğitim Platformu

Kurumsal eğitim kurumları için geliştirilen, **Outcome-Based Education (OBE)** ve **Adaptive Learning** yaklaşımını temel alan kapsamlı bir Öğrenme Yönetim Sistemi (LMS).

Platform; program yönetimi, ders yönetimi, içerik yönetimi, ölçme-değerlendirme süreçleri, adaptif öğrenme, gelişmiş analitikler ve rol tabanlı yetkilendirme (RBAC) gibi modern eğitim platformlarında bulunan temel modülleri tek bir sistem altında sunmaktadır.

---

# 🚀 Özellikler

## 👥 Rol Tabanlı Yetkilendirme (RBAC)

Platform 6 farklı kullanıcı rolünü desteklemektedir.

- Platform Yöneticisi
- Program Yöneticisi
- Eğitmen
- Ölçme Uzmanı
- Öğrenci
- Gözlemci

Her rol yalnızca kendi sorumluluğuna ait ekranlara erişebilir.

---

# 📚 Program Yönetimi

- Program oluşturma
- Ders yönetimi
- Learning Outcome (Kazanım) yönetimi
- Outcome Map
- Prerequisite ilişkileri
- Publish Workflow

---

# 📄 İçerik Yönetimi

Desteklenen içerik tipleri:

- Video
- PDF
- Quiz
- Assignment

Özellikler:

- İçerik CRUD
- Ders bazlı içerik yönetimi
- İçerik filtreleme
- Arama
- Sayfalama (Pagination)

---

# ❓ Soru Bankası

Merkezi soru yönetim sistemi.

Desteklenen özellikler:

- Question CRUD
- Question Versioning
- Question Preview
- Filtreleme
- Arama
- Pagination
- Bulk Operations
- Version History

---

# ✅ Question Review Workflow

Platformda sorular doğrudan sınavlarda kullanılmaz.

Her soru aşağıdaki kalite kontrol sürecinden geçer.

```text
Instructor

↓

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
```

### Eğitmen

- Soru oluşturur
- Soruyu günceller
- İncelemeye gönderir
- Revizyonları uygular

### Ölçme Uzmanı

- Soruyu inceler
- Revizyon ister
- Yorum bırakır
- Onaylar
- Kalite analizi yapar

---

# 📝 Exam Blueprint

Sınavlar rastgele oluşturulmaz.

Önce bir Blueprint hazırlanır.

Blueprint;

- Learning Outcome dağılımını
- Zorluk seviyelerini
- Soru sayılarını
- Outcome Coverage oranını

belirler.

Blueprint tamamlandıktan sonra sistem uygun soruları otomatik seçer.

---

# 🧪 Sınav Sistemi

- Exam Builder
- Blueprint Validation
- Auto Question Selection
- Preview
- Publish Workflow
- Timer
- Autosave
- Offline Support
- Reconnect
- Question Navigation
- Flag Question
- Attempt Management

---

# 📊 Analitik

Platform farklı kullanıcılar için farklı analiz ekranları sunmaktadır.

## Program Yöneticisi

- Overview
- Trends
- Cohort Analytics
- Learning Velocity
- Success Dashboard
- Recommendation Analytics

## Ölçme Uzmanı

- Outcome Analytics
- Mastery Heatmap
- Question Difficulty Analysis
- Item Analysis
- Assessment Quality Reports

## Eğitmen

- Student Progress
- Course Analytics
- Exam Results

## Öğrenci

- Weekly Progress
- Learning Streak
- Personal Analytics
- Learning Path

---

# 🤖 Adaptif Öğrenme

Öğrenci panelinde;

- Continue Learning
- Today's Goal
- Learning Streak
- Recommended For You
- Weekly Progress

kartları bulunmaktadır.

Sistem öğrencinin ilerlemesine göre içerik önerilerinde bulunur.

---

# 🔐 Güvenlik

- Role Based Access Control
- Route Guards
- Permission Based Navigation
- Yetkisiz URL erişim engelleme
- Yetkisiz butonların gizlenmesi

---

# 🎨 Arayüz

- Responsive Design
- Modern Dashboard
- Angular Material Components
- Reusable Components
- Professional Admin UI

---

# 🏗️ Proje Mimarisi

Proje **Feature-Based Architecture** kullanılarak geliştirilmiştir.

```
src/
│
├── core/
├── shared/
├── layouts/
├── features/
│
│── dashboard/
│── programs/
│── courses/
│── contents/
│── learning-outcomes/
│── question-bank/
│── assessments/
│── exams/
│── analytics/
│── admin/
│── student/
│── observer/
```

---

# 🛠️ Kullanılan Teknolojiler

- Angular
- TypeScript
- Angular Material
- RxJS
- SCSS
- Mock Data
- Feature Based Architecture

---

# 👨‍💻 Geliştirme İlkeleri

- Clean Code
- Single Responsibility Principle
- Reusable Components
- Lazy Loading
- Responsive First
- Modular Architecture
- Pagination
- Search
- Filtering
- Input Validation
- Character Limits

---

# 📌 Temel İş Akışı

```text
Program Manager
        │
        ▼
Program & Course Management
        │
        ▼
Instructor
        │
        ▼
Question Draft
        │
        ▼
Measurement Expert Review
        │
        ▼
Approved Question Bank
        │
        ▼
Exam Blueprint
        │
        ▼
Auto Question Selection
        │
        ▼
Published Exam
        │
        ▼
Student
        │
        ▼
Automatic / Manual Grading
        │
        ▼
Analytics
```



# 📄 Lisans

Bu proje eğitim ve geliştirme amacıyla hazırlanmıştır.

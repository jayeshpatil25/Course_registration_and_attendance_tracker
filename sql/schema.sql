-- ============================================================================
-- STUDENT REGISTRATION & ATTENDANCE TRACKER — ORACLE 21c SCHEMA
-- ============================================================================
--
-- ROW ESTIMATION (one standard college semester, ~5,000 students × 6 courses):
-- ┌─────────────────────────┬────────────────┬─────────────────────────────────┐
-- │ Table                   │ Est. Rows      │ Notes                           │
-- ├─────────────────────────┼────────────────┼─────────────────────────────────┤
-- │ COLLEGE                 │            1   │ Single university               │
-- │ DEPT                    │           10   │ ~10 departments                 │
-- │ INSTRUCTOR              │          200   │ ~20 per dept                    │
-- │ STUDENT                 │        5,000   │ Given                           │
-- │ COURSE                  │          100   │ ~10 per dept                    │
-- │ SECTION                 │          300   │ ~3 sections per course          │
-- │ BATCH                   │          900   │ ~3 batches per section          │
-- │ SECTION_COORDINATOR     │          300   │ 1:1 with SECTION                │
-- │ BATCH_COORDINATOR       │          900   │ 1:1 with BATCH                  │
-- │ REGISTRATION            │       30,000   │ 5,000 students × 6 courses      │
-- │ ATTENDANCE              │    2,400,000   │ 30,000 reg × ~80 class days     │
-- └─────────────────────────┴────────────────┴─────────────────────────────────┘
--
-- ============================================================================


-- ============================================================================
-- 1. COLLEGE
-- ============================================================================
CREATE TABLE COLLEGE (
    college_id      NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    college_name    VARCHAR2(200)   NOT NULL,
    address         VARCHAR2(500),
    phone           VARCHAR2(20),
    email           VARCHAR2(100),
    established_yr  NUMBER(4),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 2. DEPT (Department)
-- ============================================================================
CREATE TABLE DEPT (
    dept_id         NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    dept_name       VARCHAR2(200)   NOT NULL,
    college_id      NUMBER(10)      NOT NULL,
    hod_name        VARCHAR2(200),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_dept_college
        FOREIGN KEY (college_id) REFERENCES COLLEGE(college_id)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 3. INSTRUCTOR (Faculty / Professor)
-- ============================================================================
CREATE TABLE INSTRUCTOR (
    instructor_id   NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    first_name      VARCHAR2(100)   NOT NULL,
    last_name       VARCHAR2(100)   NOT NULL,
    email           VARCHAR2(150)   NOT NULL  UNIQUE,
    password_hash   VARCHAR2(256)   NOT NULL,
    dept_id         NUMBER(10)      NOT NULL,
    designation     VARCHAR2(50)    DEFAULT 'Assistant Professor',
    phone           VARCHAR2(20),
    hire_date       DATE            DEFAULT SYSDATE,
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_instructor_dept
        FOREIGN KEY (dept_id) REFERENCES DEPT(dept_id),
    CONSTRAINT chk_instructor_designation
        CHECK (designation IN (
            'Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer'
        ))
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 4. STUDENT
-- ============================================================================
CREATE TABLE STUDENT (
    student_id      NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    first_name      VARCHAR2(100)   NOT NULL,
    last_name       VARCHAR2(100)   NOT NULL,
    email           VARCHAR2(150)   NOT NULL  UNIQUE,
    password_hash   VARCHAR2(256)   NOT NULL,
    dept_id         NUMBER(10)      NOT NULL,
    enrollment_year NUMBER(4)       NOT NULL,
    semester        NUMBER(2)       DEFAULT 1,
    phone           VARCHAR2(20),
    dob             DATE,
    fa_id           NUMBER(10),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_student_dept
        FOREIGN KEY (dept_id) REFERENCES DEPT(dept_id),
    CONSTRAINT fk_student_fa
        FOREIGN KEY (fa_id) REFERENCES INSTRUCTOR(instructor_id),
    CONSTRAINT chk_student_semester
        CHECK (semester BETWEEN 1 AND 12),
    CONSTRAINT chk_student_enrollment_yr
        CHECK (enrollment_year BETWEEN 2000 AND 2100)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 5. COURSE
-- ============================================================================
CREATE TABLE COURSE (
    course_id       NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    course_code     VARCHAR2(20)    NOT NULL  UNIQUE,
    course_name     VARCHAR2(200)   NOT NULL,
    dept_id         NUMBER(10)      NOT NULL,
    credits         NUMBER(2)       NOT NULL,
    course_type     VARCHAR2(15)    DEFAULT 'THEORY' NOT NULL,
    description     VARCHAR2(1000),
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_course_dept
        FOREIGN KEY (dept_id) REFERENCES DEPT(dept_id),
    CONSTRAINT chk_course_credits
        CHECK (credits BETWEEN 1 AND 6),
    CONSTRAINT chk_course_type
        CHECK (course_type IN ('THEORY', 'PRACTICAL'))
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 6. SECTION  (a section of a course for a given semester)
-- ============================================================================
CREATE TABLE SECTION (
    section_id      NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    section_name    VARCHAR2(10)    NOT NULL,
    course_id       NUMBER(10)      NOT NULL,
    semester        VARCHAR2(20)    NOT NULL,           -- e.g. 'FALL-2025'
    capacity        NUMBER(5)       DEFAULT 60  NOT NULL,
    room            VARCHAR2(30),
    schedule        VARCHAR2(100),                       -- e.g. 'MWF 09:00-10:00'
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_section_course
        FOREIGN KEY (course_id) REFERENCES COURSE(course_id),
    CONSTRAINT chk_section_capacity
        CHECK (capacity > 0),
    CONSTRAINT uq_section_course_sem
        UNIQUE (section_name, course_id, semester)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 7. BATCH  (sub-group inside a section)
-- ============================================================================
CREATE TABLE BATCH (
    batch_id        NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    batch_name      VARCHAR2(10)    NOT NULL,
    section_id      NUMBER(10)      NOT NULL,
    capacity        NUMBER(5)       DEFAULT 20  NOT NULL,
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_batch_section
        FOREIGN KEY (section_id) REFERENCES SECTION(section_id),
    CONSTRAINT chk_batch_capacity
        CHECK (capacity > 0),
    CONSTRAINT uq_batch_section
        UNIQUE (batch_name, section_id)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 8. SECTION_COORDINATOR  (exactly one faculty per section)
-- ============================================================================
CREATE TABLE SECTION_COORDINATOR (
    sc_id           NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    section_id      NUMBER(10)      NOT NULL  UNIQUE,   -- enforces 1:1
    instructor_id   NUMBER(10)      NOT NULL,
    assigned_at     TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_sc_section
        FOREIGN KEY (section_id) REFERENCES SECTION(section_id),
    CONSTRAINT fk_sc_instructor
        FOREIGN KEY (instructor_id) REFERENCES INSTRUCTOR(instructor_id)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 9. BATCH_COORDINATOR  (exactly one faculty per batch)
-- ============================================================================
CREATE TABLE BATCH_COORDINATOR (
    bc_id           NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    batch_id        NUMBER(10)      NOT NULL  UNIQUE,   -- enforces 1:1
    instructor_id   NUMBER(10)      NOT NULL,
    assigned_at     TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_bc_batch
        FOREIGN KEY (batch_id) REFERENCES BATCH(batch_id),
    CONSTRAINT fk_bc_instructor
        FOREIGN KEY (instructor_id) REFERENCES INSTRUCTOR(instructor_id)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 10. REGISTRATION  (student enrols in a section for a semester)
-- ============================================================================
CREATE TABLE REGISTRATION (
    registration_id NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    student_id      NUMBER(10)      NOT NULL,
    section_id      NUMBER(10)      NOT NULL,
    semester        VARCHAR2(20)    NOT NULL,
    registered_at   TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    status          VARCHAR2(15)    DEFAULT 'PENDING'  NOT NULL,
    approval_status VARCHAR2(15)    DEFAULT 'PENDING'  NOT NULL,
    approved_by     NUMBER(10),
    CONSTRAINT fk_reg_student
        FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
    CONSTRAINT fk_reg_section
        FOREIGN KEY (section_id) REFERENCES SECTION(section_id),
    CONSTRAINT fk_reg_approved_by
        FOREIGN KEY (approved_by) REFERENCES INSTRUCTOR(instructor_id),
    CONSTRAINT chk_reg_status
        CHECK (status IN ('ACTIVE', 'PENDING', 'DROPPED', 'COMPLETED', 'REJECTED')),
    CONSTRAINT chk_reg_approval
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT uq_reg_student_section_sem
        UNIQUE (student_id, section_id, semester)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 11. ATTENDANCE  (per student, per section, per date)
-- ============================================================================
CREATE TABLE ATTENDANCE (
    attendance_id   NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    student_id      NUMBER(10)      NOT NULL,
    section_id      NUMBER(10)      NOT NULL,
    attendance_date DATE            NOT NULL,
    status          VARCHAR2(10)    NOT NULL,
    marked_by       NUMBER(10),                          -- instructor who marked
    marked_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_att_student
        FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
    CONSTRAINT fk_att_section
        FOREIGN KEY (section_id) REFERENCES SECTION(section_id),
    CONSTRAINT fk_att_marked_by
        FOREIGN KEY (marked_by)  REFERENCES INSTRUCTOR(instructor_id),
    CONSTRAINT chk_att_status
        CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
    CONSTRAINT uq_att_student_section_date
        UNIQUE (student_id, section_id, attendance_date)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- INDEXES  (performance-critical access paths)
-- ============================================================================
CREATE INDEX idx_student_dept      ON STUDENT(dept_id);
CREATE INDEX idx_instructor_dept   ON INSTRUCTOR(dept_id);
CREATE INDEX idx_course_dept       ON COURSE(dept_id);
CREATE INDEX idx_section_course    ON SECTION(course_id);
CREATE INDEX idx_batch_section     ON BATCH(section_id);
CREATE INDEX idx_reg_student       ON REGISTRATION(student_id);
CREATE INDEX idx_reg_section       ON REGISTRATION(section_id);
CREATE INDEX idx_att_student       ON ATTENDANCE(student_id);
CREATE INDEX idx_att_section_date  ON ATTENDANCE(section_id, attendance_date);
CREATE INDEX idx_reg_approval      ON REGISTRATION(approval_status);


-- ============================================================================
-- 12. ADMIN  (system administrators)
-- ============================================================================
CREATE TABLE ADMIN (
    admin_id        NUMBER(10)      GENERATED ALWAYS AS IDENTITY  PRIMARY KEY,
    admin_name      VARCHAR2(200)   NOT NULL,
    email           VARCHAR2(150)   NOT NULL  UNIQUE,
    password_hash   VARCHAR2(256)   NOT NULL,
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);


-- ============================================================================
-- 13. ACTIVE_SEMESTER  (single-row table for current active semester)
-- ============================================================================
CREATE TABLE ACTIVE_SEMESTER (
    id              NUMBER(1)       DEFAULT 1 PRIMARY KEY,
    semester        VARCHAR2(20)    NOT NULL,
    updated_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT chk_active_sem_single CHECK (id = 1)
)
INITRANS 2 MAXTRANS 255
STORAGE (INITIAL 64K NEXT 1M MINEXTENTS 1);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

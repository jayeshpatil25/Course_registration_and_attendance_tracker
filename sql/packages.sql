-- ============================================================================
-- STUDENT REGISTRATION & ATTENDANCE TRACKER — PL/SQL PACKAGES
-- Oracle 21c
-- ============================================================================

-- ============================================================================
-- PACKAGE SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE ATTENDANCE_PKG AS

    -- Custom exception codes
    e_duplicate_registration   EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_duplicate_registration,   -20001);

    e_section_full             EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_section_full,             -20002);

    e_duplicate_attendance     EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_duplicate_attendance,     -20003);

    e_future_date              EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_future_date,              -20004);

    e_invalid_credentials      EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_invalid_credentials,      -20005);

    e_student_not_registered   EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_student_not_registered,   -20006);

    -- -----------------------------------------------------------------------
    -- Register a student for a course section / semester
    -- -----------------------------------------------------------------------
    PROCEDURE REGISTER_STUDENT (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER,
        p_session_code  IN  VARCHAR2,
        p_reg_id        OUT NUMBER
    );

    -- -----------------------------------------------------------------------
    -- Mark attendance for a single student in a section on a date
    -- -----------------------------------------------------------------------
    PROCEDURE MARK_ATTENDANCE (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER,
        p_att_date      IN  DATE,
        p_status        IN  VARCHAR2,
        p_marked_by     IN  NUMBER,
        p_att_id        OUT NUMBER
    );

    -- -----------------------------------------------------------------------
    -- Bulk mark attendance for an entire section on a date
    -- (expects a comma-separated list of student_ids and statuses)
    -- -----------------------------------------------------------------------
    PROCEDURE BULK_MARK_ATTENDANCE (
        p_section_id    IN  NUMBER,
        p_att_date      IN  DATE,
        p_student_ids   IN  VARCHAR2,   -- '101,102,103'
        p_statuses      IN  VARCHAR2,   -- 'PRESENT,ABSENT,LATE'
        p_marked_by     IN  NUMBER,
        p_count         OUT NUMBER
    );

    -- -----------------------------------------------------------------------
    -- Get attendance percentage for a student in a section
    -- -----------------------------------------------------------------------
    FUNCTION GET_ATTENDANCE_PCT (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER
    ) RETURN NUMBER;

    -- -----------------------------------------------------------------------
    -- Authenticate student — returns 1 on success, raises exception on failure
    -- -----------------------------------------------------------------------
    PROCEDURE AUTHENTICATE_STUDENT (
        p_email         IN  VARCHAR2,
        p_password_hash IN  VARCHAR2,
        p_student_id    OUT NUMBER,
        p_first_name    OUT VARCHAR2,
        p_last_name     OUT VARCHAR2,
        p_dept_id       OUT NUMBER
    );

    -- -----------------------------------------------------------------------
    -- Authenticate instructor
    -- -----------------------------------------------------------------------
    PROCEDURE AUTHENTICATE_INSTRUCTOR (
        p_email         IN  VARCHAR2,
        p_password_hash IN  VARCHAR2,
        p_instructor_id OUT NUMBER,
        p_first_name    OUT VARCHAR2,
        p_last_name     OUT VARCHAR2,
        p_dept_id       OUT NUMBER
    );

END ATTENDANCE_PKG;
/


-- ============================================================================
-- PACKAGE BODY
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY ATTENDANCE_PKG AS

    -- =======================================================================
    -- REGISTER_STUDENT
    -- =======================================================================
    PROCEDURE REGISTER_STUDENT (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER,
        p_session_code  IN  VARCHAR2,
        p_reg_id        OUT NUMBER
    ) IS
        v_count     NUMBER;
        v_capacity  NUMBER;
        v_enrolled  NUMBER;
    BEGIN
        -- 1. Check for duplicate registration
        SELECT COUNT(*) INTO v_count
        FROM REGISTRATION
        WHERE student_id = p_student_id
          AND section_id = p_section_id
          AND session_code = p_session_code;

        IF v_count > 0 THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Student is already registered for this section/session.');
        END IF;

        -- 2. Check section capacity (with row-level lock to prevent race conditions)
        SELECT capacity INTO v_capacity
        FROM SECTION
        WHERE section_id = p_section_id
        FOR UPDATE;

        SELECT COUNT(*) INTO v_enrolled
        FROM REGISTRATION
        WHERE section_id   = p_section_id
          AND session_code = p_session_code
          AND status       = 'ACTIVE';

        IF v_enrolled >= v_capacity THEN
            RAISE_APPLICATION_ERROR(-20002,
                'Section is at full capacity (' || v_capacity || ').');
        END IF;

        -- 3. Insert registration
        INSERT INTO REGISTRATION (student_id, section_id, session_code, status)
        VALUES (p_student_id, p_section_id, p_session_code, 'ACTIVE')
        RETURNING registration_id INTO p_reg_id;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END REGISTER_STUDENT;


    -- =======================================================================
    -- MARK_ATTENDANCE  (single student)
    -- =======================================================================
    PROCEDURE MARK_ATTENDANCE (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER,
        p_att_date      IN  DATE,
        p_status        IN  VARCHAR2,
        p_marked_by     IN  NUMBER,
        p_att_id        OUT NUMBER
    ) IS
        v_count     NUMBER;
        v_reg_count NUMBER;
    BEGIN
        -- 1. Prevent marking attendance for a future date
        IF p_att_date > TRUNC(SYSDATE) THEN
            RAISE_APPLICATION_ERROR(-20004,
                'Cannot mark attendance for a future date.');
        END IF;

        -- 2. Check that the student is registered in this section
        SELECT COUNT(*) INTO v_reg_count
        FROM REGISTRATION
        WHERE student_id = p_student_id
          AND section_id = p_section_id
          AND status     = 'ACTIVE';

        IF v_reg_count = 0 THEN
            RAISE_APPLICATION_ERROR(-20006,
                'Student is not registered in this section.');
        END IF;

        -- 3. Prevent duplicate attendance for the same date / student / section
        SELECT COUNT(*) INTO v_count
        FROM ATTENDANCE
        WHERE student_id      = p_student_id
          AND section_id      = p_section_id
          AND attendance_date = p_att_date;

        IF v_count > 0 THEN
            RAISE_APPLICATION_ERROR(-20003,
                'Attendance already marked for this student on this date.');
        END IF;

        -- 4. Insert
        INSERT INTO ATTENDANCE (student_id, section_id, attendance_date, status, marked_by)
        VALUES (p_student_id, p_section_id, p_att_date, p_status, p_marked_by)
        RETURNING attendance_id INTO p_att_id;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END MARK_ATTENDANCE;


    -- =======================================================================
    -- BULK_MARK_ATTENDANCE  (entire section at once)
    -- =======================================================================
    PROCEDURE BULK_MARK_ATTENDANCE (
        p_section_id    IN  NUMBER,
        p_att_date      IN  DATE,
        p_student_ids   IN  VARCHAR2,
        p_statuses      IN  VARCHAR2,
        p_marked_by     IN  NUMBER,
        p_count         OUT NUMBER
    ) IS
        v_sid       VARCHAR2(4000) := p_student_ids;
        v_stat      VARCHAR2(4000) := p_statuses;
        v_id        NUMBER;
        v_status    VARCHAR2(10);
        v_pos1      NUMBER;
        v_pos2      NUMBER;
        v_att_id    NUMBER;
    BEGIN
        -- Prevent future-date marking
        IF p_att_date > TRUNC(SYSDATE) THEN
            RAISE_APPLICATION_ERROR(-20004,
                'Cannot mark attendance for a future date.');
        END IF;

        p_count := 0;

        -- Iterate through comma-separated lists
        LOOP
            -- Extract next student_id
            v_pos1 := INSTR(v_sid, ',');
            IF v_pos1 > 0 THEN
                v_id  := TO_NUMBER(SUBSTR(v_sid, 1, v_pos1 - 1));
                v_sid := SUBSTR(v_sid, v_pos1 + 1);
            ELSE
                v_id  := TO_NUMBER(v_sid);
            END IF;

            -- Extract next status
            v_pos2 := INSTR(v_stat, ',');
            IF v_pos2 > 0 THEN
                v_status := TRIM(SUBSTR(v_stat, 1, v_pos2 - 1));
                v_stat   := SUBSTR(v_stat, v_pos2 + 1);
            ELSE
                v_status := TRIM(v_stat);
            END IF;

            -- Insert (skip if already exists for idempotency)
            BEGIN
                INSERT INTO ATTENDANCE (student_id, section_id, attendance_date, status, marked_by)
                VALUES (v_id, p_section_id, p_att_date, v_status, p_marked_by)
                RETURNING attendance_id INTO v_att_id;
                p_count := p_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN
                    -- Update existing record instead
                    UPDATE ATTENDANCE
                    SET status    = v_status,
                        marked_by = p_marked_by,
                        marked_at = SYSTIMESTAMP
                    WHERE student_id      = v_id
                      AND section_id      = p_section_id
                      AND attendance_date = p_att_date;
                    p_count := p_count + 1;
            END;

            EXIT WHEN v_pos1 = 0;
        END LOOP;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END BULK_MARK_ATTENDANCE;


    -- =======================================================================
    -- GET_ATTENDANCE_PCT
    -- =======================================================================
    FUNCTION GET_ATTENDANCE_PCT (
        p_student_id    IN  NUMBER,
        p_section_id    IN  NUMBER
    ) RETURN NUMBER IS
        v_total     NUMBER;
        v_present   NUMBER;
    BEGIN
        SELECT COUNT(*),
               COUNT(CASE WHEN status = 'PRESENT' THEN 1 END)
        INTO v_total, v_present
        FROM ATTENDANCE
        WHERE student_id = p_student_id
          AND section_id = p_section_id
          AND status IN ('PRESENT', 'ABSENT');

        IF v_total = 0 THEN
            RETURN 0;
        END IF;

        RETURN ROUND((v_present / v_total) * 100, 2);
    END GET_ATTENDANCE_PCT;


    -- =======================================================================
    -- AUTHENTICATE_STUDENT
    -- =======================================================================
    PROCEDURE AUTHENTICATE_STUDENT (
        p_email         IN  VARCHAR2,
        p_password_hash IN  VARCHAR2,
        p_student_id    OUT NUMBER,
        p_first_name    OUT VARCHAR2,
        p_last_name     OUT VARCHAR2,
        p_dept_id       OUT NUMBER
    ) IS
    BEGIN
        SELECT student_id, first_name, last_name, dept_id
        INTO p_student_id, p_first_name, p_last_name, p_dept_id
        FROM STUDENT
        WHERE email         = p_email
          AND password_hash = p_password_hash;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20005, 'Invalid student credentials.');
    END AUTHENTICATE_STUDENT;


    -- =======================================================================
    -- AUTHENTICATE_INSTRUCTOR
    -- =======================================================================
    PROCEDURE AUTHENTICATE_INSTRUCTOR (
        p_email         IN  VARCHAR2,
        p_password_hash IN  VARCHAR2,
        p_instructor_id OUT NUMBER,
        p_first_name    OUT VARCHAR2,
        p_last_name     OUT VARCHAR2,
        p_dept_id       OUT NUMBER
    ) IS
    BEGIN
        SELECT instructor_id, first_name, last_name, dept_id
        INTO p_instructor_id, p_first_name, p_last_name, p_dept_id
        FROM INSTRUCTOR
        WHERE email         = p_email
          AND password_hash = p_password_hash;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20005, 'Invalid instructor credentials.');
    END AUTHENTICATE_INSTRUCTOR;

END ATTENDANCE_PKG;
/

-- ============================================================================
-- SEMESTER CALCULATION HELPER (Admission year + selected session)
--  - ODD term is first half: sem = 2*(year - admission_year) + 1
--  - EVEN term is second half: sem = 2*(year - admission_year)
-- ============================================================================
CREATE OR REPLACE FUNCTION CALC_STUDENT_SEMESTER (
    p_admission_year IN NUMBER,
    p_session_code   IN VARCHAR2
) RETURN NUMBER IS
    v_term ACADEMIC_SESSION.term%TYPE;
    v_year ACADEMIC_SESSION.session_year%TYPE;
    v_sem  NUMBER;
BEGIN
    SELECT term, session_year
    INTO v_term, v_year
    FROM ACADEMIC_SESSION
    WHERE session_code = p_session_code;

    IF v_term = 'ODD' THEN
        v_sem := (2 * (v_year - p_admission_year)) + 1;
    ELSE
        v_sem := (2 * (v_year - p_admission_year));
    END IF;

    IF v_sem < 1 THEN
        RETURN NULL;
    END IF;

    RETURN v_sem;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END;
/

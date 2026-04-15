# Edge Cases & Production Considerations

## 1. Race Condition During Registration (Capacity Overflow)

**Scenario:** Two students attempt to register for the last available seat in a section simultaneously.

**How it's handled:**
- The PL/SQL `REGISTER_STUDENT` procedure uses `SELECT ... FOR UPDATE` on the `SECTION` row. This acquires a row-level lock, serializing concurrent registrations.
- The second transaction blocks until the first commits. Once it proceeds, the updated enrolled count reflects the first student's registration, and the capacity check correctly rejects the second student if the section is full.
- `ROLLBACK` in the `EXCEPTION WHEN OTHERS` handler ensures no partial state is left behind.

```sql
SELECT capacity INTO v_capacity
FROM SECTION
WHERE section_id = p_section_id
FOR UPDATE;  -- row-level lock
```

---

## 2. Faculty Marking Attendance for Future Dates

**Scenario:** An instructor accidentally selects a date in the future when marking attendance.

**How it's handled:**
- **PL/SQL layer:** `MARK_ATTENDANCE` and `BULK_MARK_ATTENDANCE` both check `IF p_att_date > TRUNC(SYSDATE)` and raise `ORA-20004` if true.
- **Frontend layer:** The `<input type="date">` on the Faculty Dashboard has `max={today}` which prevents future date selection via the date picker. This is a defense-in-depth approach — even if the HTML restriction is bypassed, the server rejects the request.
- **Backend layer:** The Express route forwards PL/SQL errors (ORA-20xxx) to the client as HTTP 409.

---

## 3. Duplicate Attendance for Same Student/Section/Date

**Scenario:** A faculty coordinator submits attendance, then accidentally submits again for the same section and date.

**How it's handled:**
- The `ATTENDANCE` table has a `UNIQUE` constraint on `(student_id, section_id, attendance_date)`.
- **For single marking (`MARK_ATTENDANCE`):** An explicit `SELECT COUNT(*)` check runs before the insert. If a record exists, `ORA-20003` is raised.
- **For bulk marking (`BULK_MARK_ATTENDANCE`):** A `DUP_VAL_ON_INDEX` exception handler around each insert catches the constraint violation and **updates** the existing record instead. This makes the operation idempotent — resubmitting simply overwrites the previous status.

```sql
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        UPDATE ATTENDANCE SET status = v_status ...
```

---

## 4. Transaction Rollback on Partial Failure

**Scenario:** During a bulk attendance operation, the 15th out of 30 students fails due to an invalid status value or data integrity issue.

**How it's handled:**
- Each PL/SQL procedure has a `COMMIT` at the end of the happy path and a `ROLLBACK` + `RAISE` in the `EXCEPTION WHEN OTHERS` block.
- If any single insert within `BULK_MARK_ATTENDANCE` encounters an unexpected error (not a duplicate), the entire batch rolls back — no partial attendance records are left in the database.
- The Node.js layer catches the re-raised Oracle error, returns an HTTP 500 or 409, and the frontend displays the failure to the instructor so they can retry.

---

## 5. Duplicate Registration (Same Student, Same Section, Same Semester)

**Scenario:** A student clicks "Register" twice quickly, or tries to re-register for a course they're already enrolled in.

**How it's handled:**
- **PL/SQL layer:** `REGISTER_STUDENT` checks `SELECT COUNT(*) FROM REGISTRATION WHERE student_id = ... AND section_id = ... AND semester = ...` before inserting. If `> 0`, it raises `ORA-20001`.
- **Database layer:** The `UNIQUE` constraint `uq_reg_student_section_sem` on `(student_id, section_id, semester)` acts as a final safety net.
- **Frontend layer:** The "Register" button is disabled while `regLoading` is true, preventing double-clicks. A success message + form close provides clear feedback.

---

## 6. JWT Token Expiry Mid-Session

**Scenario:** A student is working on the dashboard and their JWT expires after 8 hours.

**How it's handled:**
- The Axios response interceptor in `services/api.js` catches any HTTP 401 response.
- It clears `localStorage` (token + user data) and redirects to the login page automatically.
- The `ProtectedRoute` component also checks the auth context on every route change, preventing stale sessions from accessing protected pages.

---

## 7. Student Trying to Access Faculty Endpoints (RBAC Bypass)

**Scenario:** A student manipulates the frontend or crafts API requests to call faculty-only endpoints like `POST /api/attendance/mark`.

**How it's handled:**
- The `authorize('instructor')` middleware on attendance-marking routes checks `req.user.role` from the decoded JWT payload.
- Since the JWT is signed with `JWT_SECRET`, the role cannot be forged without the server-side secret.
- Any role mismatch returns HTTP 403 Forbidden immediately, before the controller logic runs.

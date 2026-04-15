-- ============================================================================
-- MIGRATION: Drop Approval Workflow + Attendance Simplification
-- ============================================================================

-- 1. Allow DROP_PENDING status in REGISTRATION
ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_status;
ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_status
    CHECK (status IN ('ACTIVE', 'PENDING', 'DROPPED', 'COMPLETED', 'REJECTED', 'DROP_PENDING'));

-- 2. Allow DROP_PENDING / DROP_APPROVED / DROP_REJECTED in approval_status
ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_approval;
ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_approval
    CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'DROP_PENDING', 'DROP_APPROVED', 'DROP_REJECTED'));

-- 3. Update attendance status constraint: remove LATE/EXCUSED, add CANCELLED
-- First convert any existing LATE -> PRESENT, EXCUSED -> PRESENT
UPDATE ATTENDANCE SET status = 'PRESENT' WHERE status IN ('LATE', 'EXCUSED');
COMMIT;

ALTER TABLE ATTENDANCE DROP CONSTRAINT chk_att_status;
ALTER TABLE ATTENDANCE ADD CONSTRAINT chk_att_status
    CHECK (status IN ('PRESENT', 'ABSENT', 'CANCELLED'));

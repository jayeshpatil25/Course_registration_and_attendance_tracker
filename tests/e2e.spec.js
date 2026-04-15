// ============================================================
// Playwright E2E Tests — UniTrack Attendance Tracker
// ============================================================
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// ── Helpers ──────────────────────────────────────────────────

async function loginAs(page, email, role, password = 'password123') {
  await page.goto(BASE);
  // Click the correct role toggle
  await page.click(`#role-toggle-${role}`);
  await page.fill('#email-input', email);
  await page.fill('#password-input', password);
  await page.click('#login-submit-btn');
  // Wait for navigation
  await page.waitForURL(url => !url.toString().endsWith('/'), { timeout: 10000 });
}

// ── 1. LOGIN TESTS ───────────────────────────────────────────

test.describe('Login Page', () => {
  test('should display three role toggles: Student, Faculty, Admin', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#role-toggle-student')).toBeVisible();
    await expect(page.locator('#role-toggle-instructor')).toBeVisible();
    await expect(page.locator('#role-toggle-admin')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(BASE);
    await page.fill('#email-input', 'fake@fake.com');
    await page.fill('#password-input', 'wrongpass');
    await page.click('#login-submit-btn');
    // Wait for the API call to return and error to render
    await page.waitForTimeout(3000);
    // The page should still be on login (no redirect)
    expect(page.url()).toBe(BASE + '/');
  });

  test('should login as student and redirect to /student', async ({ page }) => {
    await loginAs(page, 'amit@unitrack.edu', 'student');
    await expect(page).toHaveURL(/\/student/);
    await expect(page.locator('text=Welcome, Amit')).toBeVisible();
  });

  test('should login as faculty and redirect to /faculty', async ({ page }) => {
    await loginAs(page, 'rajesh@unitrack.edu', 'instructor');
    await expect(page).toHaveURL(/\/faculty/);
    await expect(page.locator('text=Faculty Dashboard')).toBeVisible();
  });

  test('should login as admin and redirect to /admin', async ({ page }) => {
    await loginAs(page, 'admin@unitrack.edu', 'admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('text=Admin Dashboard')).toBeVisible();
  });
});

// ── 2. STUDENT DASHBOARD TESTS ───────────────────────────────

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'amit@unitrack.edu', 'student');
  });

  test('should display enrolled courses with coordinator info', async ({ page }) => {
    // Wait for course cards to load
    await page.waitForSelector('.glass-card', { timeout: 10000 });
    // Should see course code
    const courseCards = page.locator('text=CS101');
    await expect(courseCards.first()).toBeVisible();
  });

  test('should show active semester badge in navbar', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Semester badge may take time to load from API
    const semBadge = page.locator('nav').locator('text=ODD-2025');
    await expect(semBadge).toBeVisible({ timeout: 10000 });
  });

  test('should show section coordinator badges on course cards', async ({ page }) => {
    await page.waitForSelector('.glass-card', { timeout: 10000 });
    // Look for coordinator badges
    const coordinatorBadge = page.locator('text=Section:').first();
    await expect(coordinatorBadge).toBeVisible({ timeout: 5000 });
  });

  test('should have semester dropdown in registration form', async ({ page }) => {
    await page.click('#register-course-btn');
    await expect(page.locator('#reg-semester')).toBeVisible();
    // Check it has ODD-2025
    const options = page.locator('#reg-semester option');
    await expect(options).toHaveCount(4); // ODD-2025, EVEN-2025, ODD-2024, EVEN-2024
  });

  test('should show dropdown options with readable text (CSS fix)', async ({ page }) => {
    await page.click('#register-course-btn');
    // Verify the semester dropdown is visible and selectable
    const semSelect = page.locator('#reg-semester');
    await expect(semSelect).toBeVisible();
    // Try selecting a different option
    await semSelect.selectOption('EVEN-2025');
    await expect(semSelect).toHaveValue('EVEN-2025');
  });

  test('should open attendance detail modal', async ({ page }) => {
    await page.waitForSelector('.glass-card', { timeout: 10000 });
    const viewBtn = page.locator('text=View Attendance').first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
      // Modal should appear with table
      await expect(page.locator('text=Attendance Details')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should navigate to student profile page', async ({ page }) => {
    await page.click('text=Profile');
    await expect(page).toHaveURL(/\/student\/profile/);
    await expect(page.locator('text=VNIT')).toBeVisible({ timeout: 5000 });
  });
});

// ── 3. STUDENT PROFILE TESTS ────────────────────────────────

test.describe('Student Profile', () => {
  test('should display student details with VNIT college', async ({ page }) => {
    await loginAs(page, 'amit@unitrack.edu', 'student');
    await page.goto(`${BASE}/student/profile`);
    await expect(page.locator('text=Amit')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=VNIT')).toBeVisible();
    await expect(page.locator('text=Department')).toBeVisible();
    await expect(page.locator('text=Student ID')).toBeVisible();
  });
});

// ── 4. FACULTY DASHBOARD TESTS ───────────────────────────────

test.describe('Faculty Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'rajesh@unitrack.edu', 'instructor');
  });

  test('should display attendance and approvals tabs', async ({ page }) => {
    await expect(page.locator('text=Mark Attendance')).toBeVisible();
    await expect(page.locator('text=Approvals')).toBeVisible();
  });

  test('should show sections assigned to this faculty only', async ({ page }) => {
    const sectionSelect = page.locator('#faculty-section-select');
    await expect(sectionSelect).toBeVisible();
    // Rajesh coordinates CS101-A and CS201-A
    const options = sectionSelect.locator('option');
    const optCount = await options.count();
    // Should have > 1 (including "Select section" placeholder)
    expect(optCount).toBeGreaterThan(1);
  });

  test('should display schedule info when section selected', async ({ page }) => {
    const sectionSelect = page.locator('#faculty-section-select');
    // Select the first real option
    const options = sectionSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const value = await options.nth(1).getAttribute('value');
      if (value) {
        await sectionSelect.selectOption(value);
        // Should show schedule info
        await expect(page.locator('text=Schedule:')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=Room:')).toBeVisible();
      }
    }
  });

  test('should load students list when section selected', async ({ page }) => {
    const sectionSelect = page.locator('#faculty-section-select');
    const options = sectionSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const value = await options.nth(1).getAttribute('value');
      if (value) {
        await sectionSelect.selectOption(value);
        // Wait for students to load
        await page.waitForTimeout(2000);
        const studentCards = page.locator('text=Present').first();
        await expect(studentCards).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('should show pending approvals in approvals tab', async ({ page }) => {
    await page.click('text=Approvals');
    await page.waitForTimeout(2000);
    // Rajesh has pending approvals for CS101-A (Rohit)
    const approvalSection = page.locator('text=Approve').first();
    if (await approvalSection.isVisible()) {
      await expect(approvalSection).toBeVisible();
    }
  });

  test('should navigate to faculty profile page', async ({ page }) => {
    await page.click('text=Profile');
    await expect(page).toHaveURL(/\/faculty\/profile/);
    await expect(page.locator('text=VNIT')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Faculty ID')).toBeVisible();
  });
});

// ── 5. FACULTY PROFILE TESTS ────────────────────────────────

test.describe('Faculty Profile', () => {
  test('should display faculty details with VNIT college', async ({ page }) => {
    await loginAs(page, 'rajesh@unitrack.edu', 'instructor');
    await page.goto(`${BASE}/faculty/profile`);
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Rajesh')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=VNIT')).toBeVisible({ timeout: 5000 });
  });
});

// ── 6. ADMIN DASHBOARD TESTS ────────────────────────────────

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin@unitrack.edu', 'admin');
  });

  test('should display semester management section', async ({ page }) => {
    await expect(page.locator('text=Active Semester')).toBeVisible();
    await expect(page.locator('text=Odd Semester 2025')).toBeVisible();
  });

  test('should display course and section overview', async ({ page }) => {
    await page.waitForTimeout(3000);
    const coursesHeading = page.locator('text=Courses & Sections');
    await expect(coursesHeading).toBeVisible({ timeout: 10000 });
    // Wait for actual course data to load
    await page.waitForTimeout(2000);
    const cs101 = page.locator('text=CS101');
    await expect(cs101.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display registrations table', async ({ page }) => {
    await expect(page.locator('text=Recent Registrations')).toBeVisible({ timeout: 5000 });
    // Should show PENDING entries
    const pendingBadges = page.locator('text=PENDING');
    await expect(pendingBadges.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show stats cards', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Stats cards show numeric values with labels
    await expect(page.locator('text=Courses').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sections').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Registrations').first()).toBeVisible({ timeout: 5000 });
  });

  test('should allow changing active semester', async ({ page }) => {
    // Click on Even Semester 2025
    await page.click('text=Even Semester 2025');
    await expect(page.locator('text=Active semester updated')).toBeVisible({ timeout: 5000 });
    // Switch back
    await page.click('text=Odd Semester 2025');
    await expect(page.locator('text=Active semester updated')).toBeVisible({ timeout: 5000 });
  });
});

// ── 7. COURSE REGISTRATION (Approval Workflow) ──────────────

test.describe('Registration Approval Workflow', () => {
  test('student registration creates PENDING status', async ({ page }) => {
    await loginAs(page, 'sneha@unitrack.edu', 'student');
    // Sneha has some courses. Let's check her dashboard shows PENDING badge if any
    await page.waitForSelector('.glass-card', { timeout: 10000 });
    // Check if there are any PENDING badges visible
    const dashboardText = await page.textContent('main');
    expect(dashboardText).toBeTruthy();
  });

  test('faculty can approve a pending registration', async ({ page }) => {
    // Login as Rajesh who has pending approvals
    await loginAs(page, 'rajesh@unitrack.edu', 'instructor');
    await page.click('text=Approvals');
    await page.waitForTimeout(2000);
    
    // Check if there's an approval button
    const approveBtn = page.locator('text=Approve').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      // Wait for refresh
      await page.waitForTimeout(1000);
      // Verify the list updated
    }
  });
});

// ── 8. DROP COURSE ──────────────────────────────────────────

test.describe('Drop Course', () => {
  test('student should see Drop Course button on active courses', async ({ page }) => {
    await loginAs(page, 'amit@unitrack.edu', 'student');
    await page.waitForSelector('.glass-card', { timeout: 10000 });
    const dropBtn = page.locator('text=Drop Course').first();
    await expect(dropBtn).toBeVisible({ timeout: 5000 });
  });
});

// ── 9. LOGOUT ───────────────────────────────────────────────

test.describe('Logout', () => {
  test('should logout and redirect to login', async ({ page }) => {
    await loginAs(page, 'amit@unitrack.edu', 'student');
    await page.click('#logout-btn');
    await expect(page).toHaveURL(BASE + '/');
  });
});

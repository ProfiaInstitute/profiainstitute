# Profia Connect

PROFIA INSTITUTE — COMPLETE WEBSITE REBUILD + STUDENT PORTAL + ADMIN SYSTEM


## Course billing and PayHero fee payments

Course charges are snapshotted to student fee statements at enrollment. From
**Student Portal → Fees**, students can request a PayHero mobile-money prompt
for an amount up to their outstanding balance. The PayHero channel must be
connected to the school's Equity Bank Paybill. Confirmed PayHero callbacks are
verified against PayHero before they are assigned to the requesting student's
account; the Admin Fees module then reflects updated transactions and balances.
Student-entered receipt numbers are not accepted as proof of payment.

Apply `drizzle/migrations/0014_course_billing_mpesa.sql`,
`drizzle/migrations/0016_payhero_fee_payments_documents.sql`, and
`drizzle/migrations/0017_payhero_superadmin_settings.sql`, and
`drizzle/migrations/0018_payhero_provider_references.sql` before using PayHero
payments. Deploy the `create-fee-payment`, `create-online-payment`,
`manage-payhero-settings`, `payhero-callback`, `generate-fee-statement`, and
`generate-fee-receipt`, and `generate-fee-statement-template` Supabase Edge
Functions. A Super Admin can set the PayHero API username, password, and channel
ID from **Admin → PayHero payments**. Credentials are stored in a server-only
table and are never returned to the browser. Existing
`PAYHERO_API_USERNAME`, `PAYHERO_API_PASSWORD`, and `PAYHERO_CHANNEL_ID` Edge
Function secrets remain available as a fallback until settings are saved in
Admin; the channel ID must be connected to the Equity Bank Paybill.
`payhero-callback` must accept unauthenticated provider callbacks
(`verify_jwt = false`); it verifies payment status server-to-server with
PayHero using the provider reference returned when the STK request is created
before recording a payment.

Confirmed payments generate a receipt PDF with student details, the amount paid,
the balance after that payment (`NULL` when fully paid), the exact M-Pesa receipt
number for PayHero payments, and a `PAID` stamp. Receipts use the configured
school logo/badge, are stored in the private `fee-documents` bucket, and are
linked in the student portal with an in-app payment notification. Receipt
downloads regenerate the PDF,
so older confirmed payments can also get an updated receipt. If PayHero still has
the transaction reference, historical M-Pesa numbers are verified and backfilled
when possible; the internal payment reference is never presented as an M-Pesa
transaction number. Students can also generate a current fee statement PDF from
the portal. `FEE_RECEIPT_LOGO_URL` is optional; by default the functions load
`https://www.profiainstitute.com/favicon.png`.

Super Admins can save course-specific statement templates and account/payment
instructions from **Admin → Fees** and download a branded PDF with student and
balance placeholders. Student statement PDFs use the saved school logo, contact
details, and the relevant course's payment instructions. Admins can also record
and edit manual confirmed payments; their explanations are retained with the
transaction and changes immediately affect balances. Homepage gallery media
published from **Admin → Media** appears on the public homepage.

The optional Daraja C2B callback remains available for direct Safaricom
Paybill payments when separately configured with `MPESA_BUSINESS_SHORTCODE`
and `MPESA_C2B_CALLBACK_TOKEN`. It is not required for PayHero STK payments.

## Staff invitations

Super Admins invite staff from **Admin → Staff**, selecting the role before
the invitation is sent. Invitees set their password using the invitation link;
public staff sign-up and post-sign-up role assignment are disabled. Apply
`drizzle/migrations/0015_staff_invite_password_setup.sql`, configure
`PUBLIC_SITE_URL`, and allow the `/admin?setupPassword=1` redirect in Supabase
Auth URL settings before using invitations.



Rebuild the existing Profia Institute website into a modern, professional, fully responsive and fully functional education platform.



IMPORTANT: THIS IS A REBUILD OF AN EXISTING WEBSITE, NOT A BRAND REDESIGN.



Existing website:

https://www.profiainstitute.com/



1. MOST IMPORTANT DESIGN RULE



DO NOT CHANGE THE EXISTING PROFIA INSTITUTE BRAND IDENTITY.



Preserve the existing:



- Logo

- Brand colours

- Colour combinations

- Typography where practical

- Existing photographs

- Existing banners

- Existing school/course images

- Partner logos

- General visual identity

- Overall professional feel



Use the existing website as the primary visual reference.



Do NOT introduce a new colour palette.

Do NOT replace the existing photographs with random stock images.

Do NOT invent a new logo.

Do NOT redesign the institution into a completely different-looking website.



Where possible, retrieve/reuse the actual existing Profia images and assets from the current website.



If an existing image cannot technically be reused, create the image slot so that the administrator can upload and replace it from the admin dashboard.



---



2. TECHNOLOGY



Build this as a production-ready full-stack web application.



Preferred stack:



- React

- TypeScript

- Tailwind CSS

- shadcn/ui where useful

- Supabase for backend

- Supabase Authentication

- Supabase PostgreSQL database

- Supabase Storage for images/documents

- Responsive design

- SEO-friendly routing

- Proper loading states

- Proper error handling

- Form validation



The application must work properly on:



- Android phones

- iPhones

- Tablets

- Laptops

- Desktop computers



Mobile experience is extremely important because many Profia students will access the system using phones.



---



3. PUBLIC WEBSITE



Rebuild all important sections of the existing Profia Institute website.



Main navigation:



HOME

ABOUT US

ACADEMICS

ONLINE COURSES

TECH HUB

ADMISSION

NEWS & UPDATES

CONTACT



Include a prominent:



APPLY NOW



button.



---



4. HOMEPAGE



Recreate the current Profia homepage using the existing content, photographs and visual identity.



The homepage should include:



Hero section



Use the existing Profia hero imagery and messaging.



Include:



- January/next intake messaging where applicable

- Strong admission CTA

- Apply Now button

- Course/academic CTA



Promotional sections



Recreate the current promotional content, including:



CPA promotion



"Become a Certified Public Accountant at Profia Institute"



Include the existing CTA.



CBC Digital Skills Training



Include the existing information about:



- Introduction to Computers & Computer Packages

- Adobe Photoshop & Web Design (HTML/CSS)

- Programming with Scratch, Kodu & JavaScript



Include:



"Register Now"



and the existing pricing/location information where currently displayed.



Web Development promotion



Include the current web development promotional section and its existing imagery.



Statistics



Preserve the existing statistics displayed on the website, including:



1.2K+ Students since 2018



98% Employment rate



Do not invent replacement statistics.



Academics



Create cards for:



- School of Business

- School of Hospitality

- School of ICT

- School of Cosmetology

- School of Engineering



Each card must link to its respective school page.



News & Updates



Display latest articles/blog posts dynamically from the database.



If there are no published articles, show a professional empty state.



Partners



Recreate the existing partners section using the actual partner images/logos.



Footer



Recreate the existing footer structure and information.



Include:



- Navigation

- Schools

- Contact details

- Social links where applicable

- Profia branding

- Copyright

- Admission CTA



---



5. ABOUT US PAGE



Recreate the existing About Us content.



Use the current information including:



Profia Institute is a dynamic and innovative educational institution dedicated to empowering individuals and driving sustainable development through professional development programs.



The site currently describes Profia as a TVET-accredited college offering courses across business, accounting, ICT, hospitality and related areas.



Include:



Who We Are



Mission



"To equip the society with ICT and business developmental competence through pursuit of learning and its practical application in real-world setting."



Vision



"To be a leading college for business and ICT."



Core Values



- Innovation

- Integrity

- Excellence

- Transformation



Our History



Preserve the existing historical information about Profia's establishment in October 2018, its beginning as a business school, expansion into additional programs, and its development within Homa Bay County and the Nyanza region.



Do not replace genuine existing information with generic AI-generated institutional content.



Where the existing website contains placeholder/filler content, flag it for admin editing rather than presenting it as factual information.



---



6. ACADEMICS



Create a central Academics page showing all schools.



Schools:



1. School of Business

2. School of ICT

3. School of Hospitality

4. School of Beauty & Cosmetology

5. School of Engineering



Each school gets its own dedicated page.



---



7. SCHOOL OF BUSINESS



Recreate the current School of Business page.



Include:



- Introduction

- Why Choose Our School of Business

- Job Placement Support

- Practical Learning

- Flexible Learning

- Course cards

- FAQs

- Apply Now CTA



Courses currently listed include:



- Certified Public Accountant (CPA)

- Chartered Secretary (CS)

- Certified Investment and Financial Analyst (CIFA)

- Certified Credit Professional (CCP)

- Accounting Technician Diploma

- Certificate in Accounting and Management Skills



Do not hard-code these courses permanently.



They must come from the database so an administrator can:



- Add course

- Edit course

- Delete course

- Publish/unpublish course

- Change course image

- Change duration

- Change fees

- Change description

- Change requirements



---



8. SCHOOL OF ICT



Recreate the existing ICT page.



Include:



- Computer Foundational Skills

- Certificate in ICT

- Diploma in ICT

- Graphics Design

- AI & Machine Learning

- Data Management & Analytics



Include:



Why Choose Profia ICT:



- Job Placement

- Hands-on Learning

- Industry-Relevant Training



Include FAQs and application CTAs.



Again, all courses must be database-driven.



---



9. SCHOOL OF HOSPITALITY



Recreate the current Hospitality page.



Courses include:



- Food and Beverage Production

- Food and Beverage Services

- Housekeeping

- Baking and Pastry



Include:



- Hands-on Experience

- Job Placement

- Flexible Scheduling

- Course duration

- Fees

- Course descriptions

- Apply Now



All content must be editable from admin.



---



10. SCHOOL OF BEAUTY & COSMETOLOGY



Recreate the current Cosmetology page.



Courses include:



- Beauty Therapy

- Hair Dressing

- Nail Technology

- Barbering

- Hot Stone Massage



Include:



- Job Placement

- Flexible Schedule

- Hands-on Experience

- Course information

- FAQs

- Apply Now



Database driven.



---



11. SCHOOL OF ENGINEERING



Recreate the current Engineering page.



Include:



- Plumbing Program

- Electrical Program



Include:



- Job Placement

- Flexible Learning

- Hands-on Training

- Course duration

- Fees

- Course descriptions

- Apply Now



Database driven.



---



12. ONLINE COURSES



Recreate the existing Online Courses section.



Include learning tracks for:



- School of Business

- School of ICT

- School of Cosmetology

- School of Hospitality

- School of Engineering



Include course counts where available.



However, do NOT hard-code statistics such as active students, success rates or number of courses if they are intended to change.



Make them admin editable.



---



13. PROFIA TECH HUB



Recreate the current Tech Hub page.



Include:



- Artificial Intelligence

- Data Categorization

- 3D & 2D Data Annotation

- Training Data for Autonomous Driving

- NLP

- Video Annotation



Include the existing gallery and partner section.



The gallery should become database/storage driven so administrators can:



- Upload images

- Delete images

- Change captions

- Reorder images

- Publish/unpublish images



---



14. ADMISSION SYSTEM



This is one of the most important new features.



Create a proper online application system.



The existing admission page contains application fields such as:



- Full Name

- Phone Number

- Email Address

- Course/category

- Other Academic Qualification



Expand this into a professional application form.



Fields:



Personal Information



- First Name

- Middle Name

- Last Name

- Date of Birth

- Gender

- National ID/Passport Number

- Phone Number

- Alternative Phone

- Email Address

- County

- Town

- Physical Address



Academic Information



- Highest Academic Qualification

- Institution Attended

- Year Completed

- Course Applying For

- School/Department

- Preferred Study Mode

- Preferred Intake



Study modes:



- Full Time

- Part Time

- Online



Additional Information



- Previous training

- Work experience

- Special requirements

- How did you hear about Profia?



Documents



Allow applicants to upload relevant documents such as:



- KCSE certificate/result slip

- National ID

- Passport photo

- Other supporting documents



Use Supabase Storage.



---



15. APPLICATION WORKFLOW



When a student submits an application:



1. Validate the application.

2. Save it securely in Supabase.

3. Generate a unique application number.

4. Show a confirmation screen.

5. Send confirmation email where email service is configured.

6. Make the application immediately visible inside the admin dashboard.

7. Give the applicant a way to check application status.



Application statuses:



- Submitted

- Under Review

- Accepted

- Rejected

- Waitlisted

- More Information Required

- Enrolled



Every status change should be logged.



---



16. STUDENT PORTAL



Create a genuine student portal.



Students should be able to register/login securely.



Use Supabase Authentication.



Student portal URL:



/student



After login, show a student dashboard.



Student Dashboard



Show:



- Student name

- Student number

- Course

- Current semester/intake

- Application/admission status

- Outstanding balance

- Notifications

- Recent activity



Student Profile



Students can view/edit permitted profile information.



Sensitive information should not be freely editable.



My Course



Display:



- Program

- Course units

- Duration

- Study mode

- Academic progress



Learning Materials



Create a section for:



- Notes

- PDFs

- Assignments

- Videos

- Course resources



Administrators/tutors should be able to upload learning materials.



Assignments



Students should see:



- Assignment title

- Course/unit

- Instructions

- Due date

- Submission status



Allow file submission.



Results



Students should be able to view their academic results.



Display:



- Unit

- Score

- Grade

- Semester

- Academic year



Only authorized staff can modify results.



Fees



Create a fees section showing:



- Total fees

- Amount paid

- Balance

- Payment history

- Payment status



Do NOT implement fake payments.



Structure the system so a legitimate payment provider such as M-Pesa can be integrated later.



Notifications



Students can receive:



- Admission messages

- Fee reminders

- Class announcements

- Result notifications

- General school announcements



---



17. STUDENT APPLICATION TRACKING



Before becoming an enrolled student, an applicant should be able to check their application.



Create:



/application-status



Allow them to enter:



- Application number

- Phone/email



Show:



- Application status

- Course

- Intake

- Date submitted

- Any message from admissions



Do not expose private applicant information.



---



18. ADMIN DASHBOARD



Create a secure admin dashboard.



URL:



/admin



Admin login must be protected using Supabase Authentication.



Do NOT create a fake frontend-only admin login.



Use real authentication and database authorization.



---



19. ADMIN ROLES



Create role-based access control.



Roles:



Super Admin



Full access.



Can:



- Manage admins

- Manage students

- Manage applications

- Manage courses

- Manage website content

- Manage blogs

- Manage images

- Manage announcements

- Manage academic results

- Manage fees

- Manage learning materials

- Manage settings



Admissions Admin



Can:



- View applications

- Review applications

- Change application status

- Contact applicants

- Assign courses

- View applicant documents



Cannot manage system settings.



Academic Admin



Can:



- Manage students

- Manage courses

- Manage units

- Upload learning materials

- Enter results

- Publish results



Content Admin



Can:



- Create blogs

- Edit blogs

- Publish/unpublish blogs

- Upload website images

- Edit homepage sections

- Edit announcements



Cannot access sensitive student information.



---



20. ADMIN DASHBOARD OVERVIEW



Dashboard should display cards such as:



- Total Applications

- New Applications

- Applications Under Review

- Accepted Applications

- Total Students

- Active Students

- Total Courses

- Published Blog Posts



Include charts where useful.



Example:



Applications by month.



Admissions by course.



Students by school.



---



21. APPLICATION MANAGEMENT



Create a professional application management table.



Columns:



- Application Number

- Applicant Name

- Phone

- Email

- Course

- School

- Intake

- Date Applied

- Status

- Actions



Actions:



- View

- Review

- Accept

- Reject

- Request Information

- Add Note

- Download Documents



Include:



- Search

- Filtering

- Sorting

- Pagination



---



22. BLOG / NEWS MANAGEMENT



The existing Articles page currently has no articles, so build a proper CMS instead of hard-coding blog posts.



Admin should be able to:



- Create article

- Edit article

- Delete article

- Save draft

- Publish

- Unpublish

- Schedule publication

- Upload featured image

- Add author

- Add category

- Add tags



Public users see:



/articles



Individual article:



/articles/[slug]



SEO fields:



- Meta title

- Meta description

- Slug

- Featured image

- Social sharing image



---



23. WEBSITE CONTENT MANAGEMENT



The admin should be able to edit important website content without changing code.



Create a CMS for:



- Homepage hero

- Promotional banners

- About Us

- Mission

- Vision

- Core values

- School descriptions

- Course information

- Contact information

- FAQs

- Announcements

- Footer information



---



24. MEDIA LIBRARY



Create an admin media library.



Administrators can:



- Upload images

- Preview images

- Delete images

- Search images

- Assign images to pages

- Replace existing page images



Organize media by:



- Homepage

- About

- Business

- ICT

- Hospitality

- Engineering

- Cosmetology

- Tech Hub

- Partners

- Blog



IMPORTANT:



Existing Profia photographs should be preserved and used first.



---



25. ANNOUNCEMENTS



Create an announcement system.



Admin can create:



- General announcements

- Intake announcements

- Fee announcements

- Academic announcements

- Emergency announcements



Announcements can be displayed on:



- Homepage

- Student dashboard

- Public announcement section



---



26. CONTACT SYSTEM



Recreate the existing Contact page.



Current contact information includes:



P.O Box 323-40300, Homa Bay



Email:

profiainstitute@gmail.com



Phone:

0710221122

0793977991



Include:



- Contact form

- WhatsApp CTA

- Phone CTA

- Email CTA

- Location information



Contact form submissions should be stored in the admin dashboard.



---



27. DATABASE STRUCTURE



Create a proper relational Supabase database.



Suggested tables:



profiles

students

staff

applications

application_documents

schools

courses

course_units

intakes

enrollments

academic_years

results

fees

payments

learning_materials

assignments

submissions

announcements

notifications

articles

article_categories

media

faqs

contact_messages

site_settings

audit_logs



Use UUID primary keys.



Add timestamps:



created_at

updated_at



Use foreign keys correctly.



---



28. SECURITY



Security is extremely important.



Implement:



- Supabase Authentication

- Row Level Security

- Role-based permissions

- Protected admin routes

- Protected student routes

- Secure file storage

- Private student documents

- No exposing service-role keys in frontend

- No sensitive data in localStorage

- Server-side validation where necessary

- Input sanitization

- Proper authorization checks



A student must NEVER be able to access another student's:



- Results

- Fees

- Documents

- Application

- Personal information



---



29. AUDIT LOG



Create an audit log.



Track important actions:



- Admin login

- Application status changes

- Student creation

- Student updates

- Result changes

- Fee changes

- Course changes

- Blog publication

- Content changes

- File uploads/deletions



Show audit logs to Super Admin.



---



30. EMAIL NOTIFICATIONS



Prepare email notification infrastructure.



Examples:



When application is submitted:



"Your Profia Institute application has been received."



When application is accepted:



"Congratulations. Your application has been accepted."



When additional information is requested:



"Additional information is required for your application."



When admission is confirmed:



"Your admission to Profia Institute has been confirmed."



Keep email provider configuration in environment variables.



---



31. SEO



Implement proper SEO.



Every major page should have:



- Title

- Meta description

- Open Graph image

- Canonical URL

- Proper heading hierarchy



Use clean URLs:



/about

/academics

/business

/ict

/hospitality

/cosmetology

/engineering

/online-courses

/tech-hub

/admission

/articles

/contact



---



32. PERFORMANCE



Optimize the website for mobile users and potentially slower Kenyan internet connections.



Use:



- Lazy loading

- Optimized images

- Responsive images

- Pagination

- Efficient database queries

- Loading skeletons

- Error states



Do not load huge images unnecessarily.



---



33. WHATSAPP



Keep WhatsApp as a prominent contact option.



Create reusable WhatsApp CTA buttons.



Use the existing Profia phone/contact information.



Make the number configurable from the admin settings rather than hard-coded throughout the application.



---



34. RESPONSIVE NAVIGATION



Desktop:



Professional horizontal navigation.



Mobile:



Hamburger menu.



Ensure the Apply Now button remains highly visible.



Student and Admin navigation should have separate mobile-friendly layouts.



---



35. USER EXPERIENCE



The website should feel like a real modern Kenyan college website, not a generic AI-generated template.



Use:



- Clear CTAs

- Professional cards

- Consistent spacing

- Subtle animations

- Clean typography

- Accessible buttons

- Proper forms

- Friendly empty states

- Professional notifications



Do not overuse animations.



---



36. IMPORTANT CONTENT RULE



Use the EXISTING PROFIA WEBSITE as the source of truth for current public information.



Do not invent:



- Courses

- Fees

- Staff

- Accreditations

- Partners

- Statistics

- Contact information

- Testimonials

- Employment rates



If information is missing, create an editable CMS field or leave the section ready for admin input.



Do not fill missing information with Lorem Ipsum.



Do not create fake testimonials.



Do not create fake staff profiles.



---



37. EXISTING INFORMATION TO PRESERVE



The current website identifies Profia Institute as a TVET-accredited institution and gives its history beginning in October 2018.



Preserve the existing institutional information and existing course structure.



The website currently presents the following schools:



Business

Hospitality

ICT

Beauty & Cosmetology

Engineering



The current site also promotes the Profia Tech Hub and online learning.



Preserve these sections.



---



38. ADMIN SETTINGS



Create a Settings section.



Allow Super Admin to edit:



- Institution name

- Logo

- Phone numbers

- Email

- Address

- WhatsApp number

- Social media links

- Homepage statistics

- Application settings

- Intake dates

- Footer text

- SEO defaults



---



39. INTAKE MANAGEMENT



Create an intake management system.



Admin can create:



- January Intake

- May Intake

- September Intake

- Other intakes



## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm ci
npm run dev
```

### Supabase admin and student portal setup

Apply the SQL migrations in `drizzle/migrations` to the Supabase project before
using the admin or student portal. Keep migrations in numeric order. In
particular, `0002_admin_setup_and_student_ops.sql` replaces the initial
Super Admin bootstrap with an email allowlist.

To bootstrap the first Super Admin:

1. In Supabase Authentication, invite the intended administrator to the
   project. Do not use a shared or public email address.
2. In the Supabase SQL Editor, allowlist that exact email before the user signs
   in:

   ```sql
   insert into public.super_admin_setup (email)
   values (lower('admin@example.com'));
   ```

3. The invited user signs in at `/admin` and selects **Claim first Super Admin
   role** on the setup screen. Only the allowlisted, authenticated account can
   claim it, and the claim can happen only once.
4. Admins can create their own account from the `/admin` sign-in screen. New
   signups do not receive a role or admin access automatically; the Super Admin
   reviews them in `/admin` → **Staff** and explicitly grants a role. Email
   confirmation is controlled by Supabase Authentication settings.
5. Deploy the `invite-staff` and `manage-staff` Supabase Edge Functions and set
   `PUBLIC_SITE_URL` to the deployed website URL. Configure Supabase
   Authentication email delivery and allow the website's `/admin` URL as an
   authentication redirect URL. A Super Admin can also invite staff by email
   from the **Staff** module. Existing account roles can be granted or revoked
   there; staff accounts can be suspended, reactivated, or permanently deleted.
   Super Admin accounts are protected from suspension/deletion in this module.

   Deploy the function with:

   ```sh
   supabase functions deploy invite-staff
   supabase functions deploy manage-staff
   supabase secrets set PUBLIC_SITE_URL=https://www.profiainstitute.com
   ```

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed
   functions. Keep the service-role key out of the frontend and source control.

Existing students can register at `/student` using the email already recorded
on their student record. After email confirmation and sign-in, the portal
securely links the account to the matching unclaimed student record. New
learners can select an online course, create a portal account, verify their
email, and complete enrollment; the online enrollment process creates a
student record and student number when no existing record matches.

### Student progression email follow-ups

Apply `0003_student_progression_followups.sql` after migrations `0000` through
`0002`. In `/admin` → **Student Progression**, an academic administrator can
create a rule for a source course, next-level course, qualifying published exam
result, minimum score, and delay. New qualifying results are queued
automatically; use **Queue eligible existing results** to backfill results
published before a rule was created. Students receive an invitation to apply
for the next course; staff still review and confirm enrolment. Apply
`0007_student_progression_directory.sql` after the other numbered migrations to
show linked student, exam result, and course details in the scheduled list.

### Application supporting documents

Apply `0004_application_document_storage.sql` after the earlier migrations to
configure the private `application-docs` bucket. The online application form
accepts PDF, JPG, and PNG documents up to 5 MB each. Uploaded documents are
attached to the application and are available to admissions staff from the
linked student record in `/admin` → **Students**. Downloads use short-lived
signed URLs; the bucket remains private.

### Admin content attachments

Apply `0005_content_media_uploads.sql` after migration `0004` to add article
and announcement attachment metadata and configure storage buckets. Admins can
attach PDF/Word documents, images, audio, and video (up to 100 MB per file) to
articles and announcements. These attachments are public with their published
content. Learning materials and assignments use the private `learning` bucket,
are stored under the course folder, and are only accessible to that course's
students and authorized academic staff. Video and audio players use native
controls and retain sound.

### Staff directory

Apply `0006_staff_directory.sql` after `0005_content_media_uploads.sql` to
provide the Super Admin staff directory from the database. Apply migrations in
numeric order; each migration has a unique number.

### Online course enrollment

Apply `0008_online_course_lms.sql` to add the online-course LMS. If the initial
LMS migration has already been applied, also apply
`0009_online_course_enrollment_conflict.sql`. This fixes an ambiguous column
reference when an existing student account enrolls in an online course.

Apply `0010_student_documents.sql` to add private supporting-document storage
for student records and `0011_online_enrollment_admin_read.sql` to let
admissions staff see online course enrollments in the Students directory.
Apply `0012_preserve_archived_course_access.sql` so archived courses disappear
from public catalogues while previously enrolled students retain course details
and online lessons.
The Students panel supports PDF, JPG, and PNG files up to 5 MB and provides
staff-only signed downloads. Course deletion from the catalogue is performed
by archiving/unpublishing the course so historical enrollments and records are
preserved; removing a course from the LMS public catalogue disables its online
availability without deleting its academic course record.

### FAQ search insights and database load

Apply `0013_faq_insights_and_query_indexes.sql` after the existing migrations.
It adds indexes for the student portal's enrollment, result, fee, and payment
lookups, plus daily sharded counters for matched FAQ searches. Search insight
records contain only FAQ IDs, dates, and aggregate counts; they do not retain
search text, account IDs, names, email addresses, or IP addresses. Content Admins
and Super Admins can manage FAQs and review the previous 30 days of aggregate
search counts from `/admin` → **FAQs & Search Insights**. Visitors can search
published FAQ answers on the Contact page.

The client query cache uses a 30-second default freshness window and one retry
for failed reads to avoid unnecessary refetch and retry bursts; explicitly
configured query freshness and mutation invalidations remain in effect. These
changes reduce avoidable database work but do not by themselves guarantee a
specific concurrency limit. Capacity for 1,000–10,000 active users depends on
the Supabase compute plan, read/write mix, and peak request rate; validate with
a representative load test and monitor database CPU, query latency, connection
usage, and Edge Function errors in the Supabase dashboard before increasing
production traffic.

Email delivery requires a verified sender on the Institute's domain and a
Resend account. Deploy the function with the Supabase CLI:

```sh
supabase functions deploy send-student-progression-followups
```

In Supabase **Project Settings → Edge Functions → Secrets**, configure
`RESEND_API_KEY`, `SCHOOL_EMAIL_FROM` (for example,
`admissions@your-verified-domain`), and `PUBLIC_SITE_URL`. Supabase provides
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Do not
put service-role credentials in the frontend, source control, or a public
scheduler.

Configure Supabase Cron or another trusted scheduler to send a `POST` request
to `/functions/v1/send-student-progression-followups` every few minutes, with
both `Authorization: Bearer <service-role-key>` and
`apikey: <service-role-key>` headers and a JSON body such as `{}`. Store the
key in Supabase Vault or the scheduler's encrypted secret store. The function
rejects requests without the service-role authorization. Verify the sender
domain before enabling the schedule; until then, queued messages remain
undelivered.

### Profia-branded authentication emails

The Supabase Auth templates in `supabase/templates` use the current Institute
logo asset and Profia brand colours for account confirmation, staff invitations,
magic links, password recovery, email changes, and reauthentication. The
corresponding template subjects and paths are configured in
`supabase/config.toml`.

After linking the Supabase CLI to the project, apply the Auth template
configuration with:

```sh
supabase config push
```

Check the email templates in Supabase **Authentication → Email Templates** after
the update. Also set the production **Site URL** and allowed redirect URLs under
**Authentication → URL Configuration**. The logo image must remain publicly
available at the URL above. Template changes in this repository do not alter
the hosted project's email branding until its configuration is pushed (or the
templates are pasted into the Supabase dashboard). When the refreshed website
is deployed over the current website, update the template image source to the
deployed `/images/logo.png` URL if the legacy static logo URL has been removed.

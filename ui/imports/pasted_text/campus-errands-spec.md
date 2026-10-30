The product allows students to request items to be collected from campus stores, facilities, or landmarks, while other students can accept those requests as couriers and deliver them.

Overall visual direction

Create a minimalistic, modern, clean university web application.

Use a predominantly white background with dark forest green and deep navy/blue accents.

Suggested palette:

White: #FFFFFF
Off-white background: #F7F9F8
Dark forest green: #12372A
Deep navy blue: #162A46
Muted green: #3F6B5A
Light green/blue for selected states: #E8F1ED
Light grey borders: #E4E8E6
Dark charcoal text: #1B2522

Keep the interface professional and understated. Avoid excessive gradients, illustrations, oversized rounded cards, glassmorphism, or playful graphics. Use subtle shadows, thin borders, generous whitespace, 8–12px corner radii, clean typography, and simple outline icons.

Use a font similar to Inter.

The desktop layout should use a clean top navigation bar. Make all screens responsive for desktop and mobile.

Navigation

Create a consistent navigation bar containing:

Logo / App Name | Orders | Create Request | My Activity | Credits balance | Profile avatar

Example credit display:
24 Credits

The same user can function as both a Requester and a Courier, so do not create completely separate accounts for these roles.

WORKFLOW 1 — LOGIN
Screen 1: Login

Create a simple centered login page.

Left/top area:

Minimal app logo
App name
Short text: "Campus errands, made easier."

Login card:

University email
Password
"Remember me"
"Forgot password?"
Primary dark-green Log in button
Secondary link: Create an account

Include subtle text indicating the platform is for university students.

Screen 2: Sign Up

Fields:

Full name
University email
Password
Confirm password
Create account button

Show an informational note:
"You'll receive starter credits when you create your account."

After successful login, redirect the user to the Orders page.

WORKFLOW 2 — ORDER PLACING
Orders Page / Main Dashboard

This is the main student page.

Header:
Campus Errands

Subtitle:
"Request something or help another student."

At the top, show a small summary:

Available credits
Active requests
Active deliveries

Include two prominent actions:
+ Create Request
Browse Open Requests

Under this, create filter tabs:

Open Requests | My Requests | My Deliveries | Completed

Open request cards

Each card should display:

Pickup location
Delivery location
Short request description
Number of credits offered
Requested time / deadline
Request status
Requester's first name/avatar
View Details button

Example:

CoffeeBean @ COM3 → PGP

"Pick up one iced latte."

4 credits

Deliver by 3:30 PM

Status badge: OPEN

Create Request Screen

Use a clean form or 3-step flow.

Step 1 — Pickup
Pickup location dropdown
Campus supplier/facility selection
Step 2 — Delivery
Delivery location
Request details / instructions
Preferred delivery time or deadline
Step 3 — Credits & Confirmation
Credits offered
Current available credits
Credits remaining after request
Summary of pickup
Summary of delivery
Instructions
Deadline

Primary CTA:
Place Request

Include this subtle information:
"Credits will be reserved when this request is created."

After submission show a clean success state:

✓ Request created

"Your request is now visible to available couriers."

Buttons:
View Request
Back to Orders

WORKFLOW 3 — ORDER ACCEPTANCE
Order Details Page

When a potential courier selects an open request, show:

Header:
Errand Details

Status badge:
OPEN

Main card:

Pickup location
Delivery location
Request details
Deadline
Credits earned
Requester information

Create a simple visual journey:

Pickup → Deliver → Complete

Primary dark-green CTA:
Accept Request

Secondary:
Back

After pressing Accept Request, show a confirmation modal:

Accept this errand?

"You'll be responsible for collecting and delivering this request."

Cancel | Accept Errand

Accepted Order / Courier View

Once accepted, update the order status to:
ACCEPTED

Show:

Requester
Pickup location
Delivery location
Instructions
Credits to earn
Deadline

Create a vertical or horizontal status tracker:

Accepted → Picked Up → Delivered → Completed

Provide contextual actions:

Mark as Picked Up

then

Mark as Delivered

After delivery is confirmed, show:

✓ Errand completed

+4 Credits

Use green success styling without making it visually excessive.

PROFILE PAGE

Create a minimal student profile page.

Header:
My Profile

Profile summary card:

Avatar
Full name
University email
Member since
Current credits

Stats:

Requests created
Errands completed
Credits earned

Add an Activity section with:

Recent requests
Recent deliveries
Credit transaction history

Example transaction rows:

+4 credits — Completed COM3 → PGP errand

−3 credits — Request completed

Provide Edit Profile and Log Out actions.

ADMIN PAGE

Create a separate clean Admin Dashboard using the same visual design system.

Add a left sidebar:

Overview
Orders
Users
Suppliers
Activity Logs
Overview

Display four compact statistics:

Active Orders
Open Requests
Completed Orders
Registered Users

Below, show:

Recent Orders

Table columns:
Order ID | Requester | Courier | Pickup | Status | Credits | Created

Statuses should use subtle badges:

Open
Accepted
Picked Up
Delivered
Completed
Cancelled
Expired
Order Management

Create a searchable/filterable order table.

Filters:

Status
Date
Pickup location

Clicking an order opens a side panel containing its complete lifecycle and details.

User Management

Table:
Student | Email | Credits | Requests | Deliveries | Status

Allow admins to view user details.

Supplier Management

Show campus suppliers, facilities, and landmarks.

Include:
+ Add Supplier

Allow Create, View, Edit, and Delete actions.

Important interaction states

Design UI variants for:

Loading
Empty state
Success
Error
Disabled buttons
Insufficient credits
Expired request
Cancelled request
Already accepted request

Example empty state:

No open errands right now

"Check again later or create your own request."

The requester must not be able to accept their own request.

If another courier has already accepted an order, disable the Accept button and display:

This request has already been accepted.

Design system

Build reusable Figma components for:

Navigation
Sidebar
Buttons
Inputs
Dropdowns
Request cards
Status badges
Credit badge
Modal
Tables
Toast notifications
Empty states
Order progress tracker

Use Auto Layout and reusable component variants.

Keep information hierarchy extremely clear and prioritize usability over decoration.

The final prototype should clearly demonstrate these three end-to-end flows:

1. Login → Orders

2. Orders → Create Request → Confirm Request

3. Browse Open Requests → View Order → Accept → Pick Up → Deliver → Complete

Also provide fully designed Profile, Orders, and Admin Dashboard pages.

The resulting application should feel like a polished university software engineering project: simple, credible, modern, functional, and realistic rather than a conceptual Dribbble design.
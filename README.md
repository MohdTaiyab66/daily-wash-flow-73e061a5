# Remix of Partners App

URBAN WASH PARTNER PLATFORM

Build a production-ready MVP for a startup called Urban Wash.

About Urban Wash

Urban Wash is a hyperlocal doorstep car care platform based in Lucknow, India.

Urban Wash provides recurring car care subscriptions.

The primary service is called Daily Shine.

Daily Shine is a daily exterior cleaning service where partners visit customers every morning and clean their cars using Urban Wash chemicals and microfiber cloths.

Urban Wash is moving from an employee-based model to a partner marketplace model similar to Uber, Zepto, Swiggy and Urban Company.

The first version should focus on:

Partner App

Admin Dashboard

Customer app will be built later.

Brand Identity

Company Name:
Urban Wash

Theme Colors:

Orange

Black

White

Style:

Premium

Professional

Modern

Clean

Startup-like

Design should feel similar to:

Zepto Partner App

Swiggy Partner App

Urban Company Partner App

User Types

1. Partner

Daily Shine Service Partner

Partners perform daily car cleaning services.

Partners are not employees.

Partners choose work based on availability.

2. Admin

Urban Wash management team.

Admin manages:

customers

partners

earnings

complaints

payouts

PARTNER APP

Create complete partner application.

Partner Login

Features:

Mobile OTP Login

Aadhaar Number

PAN Number

Profile Photo

Bank Account Details

IFSC Code

Store all partner information securely.

Partner Dashboard

Show:

Today's Earnings

Weekly Earnings

Monthly Earnings

Per Hour Earnings

Lifetime Earnings

Cars Assigned

Cars Completed

Partner Rating

Referral Earnings

Incentive Earnings

Professional dashboard cards.

Car Selection System

This is a core Urban Wash feature.

Partners can choose:

15 Cars

20 Cars

25 Cars

30 Cars

35 Cars

Each category shows:

Cars Selected

Rate Per Car

Estimated Daily Earnings

Estimated Weekly Earnings

Estimated Monthly Earnings

Estimated Working Hours

Estimated Travel Distance

Example:

15 Cars
₹16 per car

20 Cars
₹17 per car

25 Cars
₹18 per car

30 Cars
₹19 per car

System should automatically calculate earnings.

Availability System

Partner can:

Go Online

Go Offline

Mark Leave

Emergency Leave

When partner becomes unavailable, assigned cars should become available for reassignment later.

Today's Services Screen

Show:

Customer Name

Vehicle Name

Vehicle Number

Address

Time Slot

Distance

Status

Buttons:

Navigate

Call Customer

Start Service

Unavailable Vehicle

Complete Service

Route Planning

Create route screen.

Display:

Customer Sequence

Estimated Distance

Estimated Time

Google Maps integration placeholder.

Future route optimization ready.

Service Verification

Very important.

Partner must upload live service photos.

No gallery uploads allowed.

Before Service Photos:

Front

Rear

Left

Right

After Service Photos:

Front

Rear

Left

Right

Store:

GPS Location

Timestamp

Photo Metadata

Unavailable Vehicle Flow

Partner can mark:

Vehicle Not Available

Parking Locked

Customer Asked To Skip

Access Not Available

Customer Not Responding

Store reason.

Referral System

Partner Referral Program

Partner shares referral code.

If referred partner completes 30 days:

Referrer receives ₹500

New Partner receives ₹500

Track:

Referrals Sent

Active Referrals

Referral Earnings

Customer Acquisition Incentive

Partners can onboard customers.

Track:

Customer Referrals

Approved Customers

Incentive Earnings

Example:

1 Customer = ₹100

5 Customers = ₹750

10 Customers = ₹2000

Training Center

Create learning module.

Sections:

Daily Shine SOP

Chemical Usage

Microfiber Usage

Vehicle Safety

Customer Behaviour

Photo Guidelines

Do's and Don'ts

Video support ready.

Earnings Screen

Show:

Today

Week

Month

Lifetime

Referral Earnings

Customer Referral Incentives

Payout History

Graph and statistics.

Profile Screen

Show:

Partner Name

Partner ID

Phone Number

Rating

Cars Completed

Attendance Percentage

Bank Details

Verification Status

ADMIN DASHBOARD

Create responsive web dashboard.

Dashboard Home

Show:

Active Customers

Active Partners

Today's Services

Completed Services

Missed Services

Revenue

Complaints

Renewals Due

Customer Management

Show:

Customer Name

Vehicle

Subscription

Renewal Date

Assigned Partner

Status

Search and Filters

Partner Management

Show:

Partner Name

Rating

Cars Assigned

Cars Completed

Attendance

Earnings

Status

Buttons:

Suspend

Activate

Edit

Revenue Dashboard

Show:

Daily Revenue

Weekly Revenue

Monthly Revenue

Subscription Revenue

Add-On Revenue

Charts and analytics.

Complaint Management

Show:

Customer

Partner

Complaint Type

Date

Status

Resolution Notes

Assign Supervisor

Payout Management

Auto-calculate:

Completed Services

Referral Bonuses

Customer Incentives

Penalties

Final Weekly Payout

Show downloadable reports.

Service Monitoring

Track:

Completed Services

Pending Services

Missed Services

Unavailable Vehicles

Photo Verification

GPS Verification

DATABASE STRUCTURE

Create database models for:

Partners

Customers

Vehicles

Services

Referrals

Earnings

Complaints

Payouts

Attendance

Training Progress

FUTURE READY FEATURES

Keep architecture scalable for:

Customer App

Auto Reassignment

AI Route Optimization

Heat Maps

Dynamic Pricing

Weather Scheduling

Leaderboards

Advanced Analytics

Multi-City Expansion

MVP PRIORITY

Build only:

Partner App

Admin Dashboard

Use mock customer data initially.

Focus on clean UI, proper navigation, mobile responsiveness, scalability and startup-grade architecture.

Generate complete frontend, backend, database schema and Supabase integration.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://daily-wash-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1206e21a-d7b1-4465-ae7c-4fc59022829f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

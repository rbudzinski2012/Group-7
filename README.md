# Group-7: Subscription Tracker

**Course**: COP5818 – FinTech Web Application Final Project  
**Repository**: https://github.com/rbudzinski2012/Group-7.git  
**Team Members**: Remington Budzinski, Brendan Fuller, Shena Parks, Pushpa Rathina Tom Samuel Thanaraj, and Ivette Touzalin-Awadallah

## 1. Project Purpose & Essential Features
A responsive full-stack FinTech web application that normalizes recurring subscription costs across diverse billing frequencies (`weekly`, `monthly`, `quarterly`, `annual`) into integer cents to track annualized cash outflows and calculate cumulative annual savings from canceled services.

### Essential Features
* **Subscription Creation & Editing Modal** with strict client-side and server-side validation.
* **Server-Side Financial Normalization** converting varied billing cycles into standardized annual (`weekly * 52`, `monthly * 12`, `quarterly * 4`, `annual * 1`) and monthly equivalent (`Math.round(annual_cents / 12)`) costs in integer cents.
* **Full Lifecycle Controls** via `PATCH /api/subscriptions/:id/status` (status toggle with signed audit log tracking that prevents double-counting savings), `PUT /api/subscriptions/:id` (edit), and `DELETE /api/subscriptions/:id` (removal with foreign-key cascade).
* **Real-Time Dashboard Summary Cards** displaying Active Annual Outflow, Monthly Outflow Equivalent, Reclaimed Annual Savings, and Active Subscriptions count.
* **Category Tag Filtering** (`Entertainment`, `Sports`, `Fitness`, `Software & Productivity`, `Food & Lifestyle`, `Education`, `Travel`, `Other`) plus CSV export and category spend breakdown bars.

---

## 2. Prerequisites & Installation
* **Node.js**: v18.x or v20.x LTS (includes `npm`)
* **OS**: Windows, macOS, or Linux

### Step-by-Step Setup (From a Fresh Copy)
1. Clone or unzip the project folder and navigate into it:
   ```bash
   cd COP5818_Final_Group7

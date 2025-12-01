# Disaster SOS - Emergency Response System

A comprehensive, real-time disaster management and rescue coordination platform designed for Sri Lanka and similar contexts where low-bandwidth solutions are critical.

## 🚨 Overview

This system enables trapped individuals to send distress reports (SOS) with their location, which rescuers can then claim and respond to in real-time. The platform includes:

- **User App**: One-tap SOS button with GPS, offline queueing, and tracking
- **Rescuer Dashboard**: Real-time map with clustered markers, claim workflow, and status updates  
- **Analytics Panel**: Live statistics and resource allocation insights
- **SMS Fallback**: Works even without internet via SMS gateway

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (PWA)                          │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌──────────────┐ │
│  │ SOS Page │  │   Dashboard   │  │ Tracker │  │    Stats     │ │
│  │  (User)  │  │  (Rescuer)   │  │  Page   │  │    Page      │ │
│  └────┬─────┘  └──────┬───────┘  └────┬────┘  └──────┬───────┘ │
│       │               │               │              │          │
│       └───────────────┴───────────────┴──────────────┘          │
│                           │                                      │
│              ┌────────────┴────────────┐                        │
│              │   Socket.IO + REST API   │                        │
│              └────────────┬────────────┘                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                  ┌─────────┴─────────┐
                  │   BACKEND (Node)   │
                  │                    │
                  │  ┌──────────────┐  │
                  │  │   Express    │  │
                  │  │   + Socket.IO│  │
                  │  └──────────────┘  │
                  │         │          │
                  │  ┌──────┴───────┐  │
                  │  │  In-Memory   │  │
                  │  │  Data Store  │  │
                  │  │  (Use DB in  │  │
                  │  │  production) │  │
                  │  └──────────────┘  │
                  │         │          │
                  │  ┌──────┴───────┐  │
                  │  │ SMS Gateway  │  │
                  │  │   (Twilio)   │  │
                  │  └──────────────┘  │
                  └────────────────────┘
```

## 📁 Project Structure

```
Disaster Management/
├── backend/
│   ├── server.js           # Main Express + Socket.IO server
│   ├── package.json        # Backend dependencies
│   ├── .env.example        # Environment variables template
│   └── uploads/            # Photo uploads directory
│
├── frontend/
│   ├── public/
│   │   └── icons/          # PWA icons
│   ├── src/
│   │   ├── main.jsx        # React entry point
│   │   ├── App.jsx         # Main app with routing
│   │   ├── index.css       # Tailwind CSS styles
│   │   ├── context/
│   │   │   ├── SocketContext.jsx   # WebSocket state management
│   │   │   └── OfflineContext.jsx  # Offline queue management
│   │   └── pages/
│   │       ├── HomePage.jsx        # SOS button & form
│   │       ├── DashboardPage.jsx   # Rescuer map dashboard
│   │       ├── TrackPage.jsx       # Report tracking page
│   │       └── StatsPage.jsx       # Analytics dashboard
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js      # Vite + PWA configuration
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone and install backend:**
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

2. **Install and run frontend:**
```bash
cd frontend
npm install
npm run dev
```

3. **Access the app:**
- User SOS: http://localhost:5173/
- Rescuer Dashboard: http://localhost:5173/dashboard
- Statistics: http://localhost:5173/stats

## 🔑 Key Features

### For Users (Trapped Persons)

| Feature | Description |
|---------|-------------|
| **One-Tap SOS** | Large emergency button that captures GPS instantly |
| **Detailed Report** | Add severity, medical flags, photo, and message |
| **Offline Queue** | Reports queued locally when offline, auto-sync when online |
| **Tracking Code** | 4-character code to share with others for tracking |
| **Real-time Updates** | See when rescuer is assigned, en route, and arrived |
| **SMS Fallback** | Send `SOS LAT,LNG MESSAGE` via SMS when no data |

### For Rescuers

| Feature | Description |
|---------|-------------|
| **Live Map** | Leaflet map with OpenStreetMap, color-coded markers |
| **Claim System** | Claim reports to prevent duplicate responses |
| **Status Workflow** | Update: Claimed → En Route → Arrived → Rescued → Closed |
| **Severity Filters** | Filter by Critical, High, Medium, Low |
| **Real-time Sync** | All updates pushed via WebSocket instantly |
| **Mobile Friendly** | Works on phones for field rescuers |

### For Coordinators

| Feature | Description |
|---------|-------------|
| **Analytics** | Total reports, by status, by severity |
| **Pipeline View** | Visual funnel from New to Closed |
| **Active Users** | See connected rescuers and users |
| **Success Rate** | Percentage of rescued cases |

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/reports` | Create new SOS report |
| `GET` | `/api/reports` | List all reports (with filters) |
| `GET` | `/api/reports/:id` | Get single report by ID or short code |
| `POST` | `/api/reports/:id/claim` | Claim a report (rescuer) |
| `PUT` | `/api/reports/:id/status` | Update report status |
| `POST` | `/api/reports/:id/release` | Release/unclaim a report |
| `POST` | `/api/rescuers/register` | Register as rescuer |
| `GET` | `/api/rescuers` | List all rescuers |
| `GET` | `/api/stats` | Get statistics |
| `POST` | `/api/sms/incoming` | Twilio SMS webhook |
| `GET` | `/api/health` | Health check |

## 🔌 WebSocket Events

### Client → Server
- `rescuer:join` - Join as rescuer, receive all reports
- `user:track` - Track a specific report by short code
- `rescuer:location` - Update rescuer's GPS position

### Server → Client
- `reports:sync` - Initial sync of all reports
- `report:new` - New report created
- `report:update` - Report status changed
- `rescuer:location` - Rescuer position update

## 📱 Progressive Web App

The frontend is a full PWA with:
- **Offline Support**: Service worker caches app shell and map tiles
- **Install Prompt**: Can be installed to home screen
- **Push Ready**: Structure supports push notifications (add server)
- **Local Queue**: Reports stored in localStorage when offline

## 🔐 Security Features

- **HTTPS/WSS**: Always use TLS in production
- **Rate Limiting**: 100 req/15min general, 10 SOS/min for emergencies
- **Helmet**: Security headers enabled
- **CORS**: Configured for frontend origin
- **Optional PII**: Phone number is optional, supports anonymous reports
- **File Validation**: Only images allowed, 5MB limit

## 📲 SMS Fallback (Twilio Integration)

When users have no internet, they can SMS:
```
SOS 6.9271,79.8612 Flooding in basement
```

To set up:
1. Create Twilio account
2. Get phone number
3. Set webhook URL to `/api/sms/incoming`
4. Add credentials to `.env`

## 🗺️ Sri Lanka Context

This system is optimized for Sri Lanka disaster response:
- Default map centered on Sri Lanka (7.8731, 80.7718)
- SMS fallback critical for rural areas with poor data
- Sinhala/Tamil localization ready (add i18n)
- Works on low-end phones (minimal JS, no heavy frameworks)

## 🔧 Production Deployment

### Recommended Stack
- **Frontend**: Vercel or Netlify (free tier works)
- **Backend**: Railway, Render, or AWS EC2
- **Database**: PostgreSQL with PostGIS for geo queries
- **Storage**: AWS S3 or Cloudflare R2 for photos
- **SMS**: Twilio or local provider

### Environment Variables
```env
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+94...
```

## 📈 Future Enhancements

- [ ] PostgreSQL + PostGIS for geo-clustering
- [ ] Push notifications for rescuers
- [ ] WhatsApp Business API integration
- [ ] Volunteer management module
- [ ] Resource allocation (vehicles, supplies)
- [ ] Multi-language support (Sinhala, Tamil)
- [ ] Historical analytics and reporting
- [ ] Integration with national emergency services
- [ ] QR code posters for quick access
- [ ] NFC tags for locations

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

MIT License - Free for humanitarian use

---

**Built with ❤️ for disaster relief and emergency response**

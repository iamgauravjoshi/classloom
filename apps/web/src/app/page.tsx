import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  IndianRupee,
  School,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const metrics = [
  {
    label: "Total Students",
    value: "1,284",
    change: "+12.4%",
    positive: true,
    icon: GraduationCap,
    tone: "blue",
  },
  {
    label: "Total Teachers",
    value: "78",
    change: "+3.2%",
    positive: true,
    icon: Users,
    tone: "orange",
  },
  {
    label: "Total Classes",
    value: "42",
    change: "+2.1%",
    positive: true,
    icon: School,
    tone: "purple",
  },
  {
    label: "Fees Collected",
    value: "₹18.6L",
    change: "-1.8%",
    positive: false,
    icon: IndianRupee,
    tone: "green",
  },
];

const activity = [
  {
    initials: "AS",
    name: "Aarav Sharma",
    detail: "Student enrollment sample",
    time: "10:42 AM",
    color: "blue",
  },
  {
    initials: "PM",
    name: "Priya Mehta",
    detail: "Attendance sample",
    time: "09:18 AM",
    color: "orange",
  },
  {
    initials: "RK",
    name: "Rohan Kumar",
    detail: "Fee collection sample",
    time: "Yesterday",
    color: "purple",
  },
  {
    initials: "SK",
    name: "Sara Khan",
    detail: "Class assignment sample",
    time: "Yesterday",
    color: "green",
  },
];

export default function Home() {
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            <span>Dashboard</span>
            <ChevronRight size={14} />
            <strong>Admin Dashboard</strong>
          </div>
          <h1>Admin Dashboard</h1>
          <p>Here&apos;s what&apos;s happening in your school today.</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={16} />
          <span>Sample academic year · 2026–27</span>
        </div>
      </div>
      <div className="sample-banner">
        <span className="sample-banner-icon">✦</span>
        <div>
          <strong>Welcome to your ClassLoom preview</strong>
          <p>
            The figures below are sample data to demonstrate the dashboard
            layout. School workflows arrive in later phases.
          </p>
        </div>
        <Badge variant="secondary">PHASE 0</Badge>
      </div>
      <section className="metrics-grid" aria-label="Sample school metrics">
        {metrics.map((metric) => (
          <Card key={metric.label} className="metric-card">
            <CardContent>
              <div className="metric-top">
                <span className={`metric-icon metric-${metric.tone}`}>
                  <metric.icon size={22} />
                </span>
                <span
                  className={`metric-change ${metric.positive ? "positive" : "negative"}`}
                >
                  {metric.positive ? (
                    <ArrowUpRight size={14} />
                  ) : (
                    <ArrowDownRight size={14} />
                  )}
                  {metric.change}
                </span>
              </div>
              <p className="metric-label">{metric.label}</p>
              <strong className="metric-value">{metric.value}</strong>
              <p className="metric-caption">Sample data</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="dashboard-grid">
        <Card className="chart-card">
          <CardHeader>
            <div>
              <CardTitle>Student Overview</CardTitle>
              <p className="card-subtitle">Enrollment trend · sample data</p>
            </div>
            <span className="card-period">2026–27</span>
          </CardHeader>
          <CardContent>
            <div className="chart-area">
              <div className="chart-gridlines">
                <span>1,500</span>
                <span>1,000</span>
                <span>500</span>
                <span>0</span>
              </div>
              <div className="chart-bars">
                {[54, 62, 58, 72, 68, 80, 75, 89, 84, 95, 90, 100].map(
                  (height, index) => (
                    <div className="chart-column" key={index}>
                      <div
                        className="chart-bar"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="chart-months">
              {"Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar"
                .split(" ")
                .map((month) => (
                  <span key={month}>{month}</span>
                ))}
            </div>
            <div className="chart-legend">
              <i /> Total students
            </div>
          </CardContent>
        </Card>
        <Card className="attendance-card">
          <CardHeader>
            <div>
              <CardTitle>Attendance Overview</CardTitle>
              <p className="card-subtitle">Today · sample data</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="donut-wrap">
              <div className="donut-chart">
                <div>
                  <strong>92%</strong>
                  <span>Present</span>
                </div>
              </div>
            </div>
            <div className="attendance-stats">
              <div>
                <span>
                  <i className="legend-present" />
                  Present
                </span>
                <strong>1,181</strong>
              </div>
              <div>
                <span>
                  <i className="legend-absent" />
                  Absent
                </span>
                <strong>77</strong>
              </div>
              <div>
                <span>
                  <i className="legend-late" />
                  Late
                </span>
                <strong>26</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="dashboard-grid lower-grid">
        <Card className="activity-card">
          <CardHeader>
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <p className="card-subtitle">
                Example events from a sample school
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {activity.map((item) => (
              <div className="activity-row" key={item.name}>
                <span className={`activity-avatar activity-${item.color}`}>
                  {item.initials}
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.detail}</p>
                </div>
                <time>{item.time}</time>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="calendar-card">
          <CardHeader>
            <div>
              <CardTitle>Upcoming Events</CardTitle>
              <p className="card-subtitle">Sample school calendar</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="event-row">
              <span className="event-date">
                <strong>05</strong>
                <small>OCT</small>
              </span>
              <div>
                <strong>Teacher Development Day</strong>
                <p>Whole school · Sample event</p>
              </div>
            </div>
            <div className="event-row">
              <span className="event-date event-date-orange">
                <strong>12</strong>
                <small>OCT</small>
              </span>
              <div>
                <strong>Parent Meeting</strong>
                <p>Senior wing · Sample event</p>
              </div>
            </div>
            <div className="event-row">
              <span className="event-date event-date-purple">
                <strong>24</strong>
                <small>OCT</small>
              </span>
              <div>
                <strong>Autumn Break Begins</strong>
                <p>All classes · Sample event</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

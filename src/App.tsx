import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon';
import { ToastProvider } from './components/ui';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { VehicleScreen } from './screens/Vehicle';
import { Vehicles } from './screens/Vehicles';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Проверка', icon: 'search' },
  { to: '/cars', label: 'Машины', icon: 'car' },
  { to: '/history', label: 'История', icon: 'clock' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

function TabBar() {
  const { pathname } = useLocation();
  // The car screen has its own action bar in the thumb zone.
  if (pathname.startsWith('/car/')) return null;
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <main className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/car/:id" element={<VehicleScreen />} />
            <Route path="/cars" element={<Vehicles />} />
            <Route path="/history" element={<History />} />
            <Route path="/more" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <TabBar />
      </ToastProvider>
    </HashRouter>
  );
}

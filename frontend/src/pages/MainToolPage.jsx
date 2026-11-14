import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../shell/AppShell';
import { tabFromPath } from '../shell/routes';
import { useSettings } from '../shell/SettingsContext';
import { useHotkeys, focusPageSearch } from '../lib/useHotkeys';
import LoadsScreen from '../screens/loads/LoadsScreen';
import InquiriesScreen from '../screens/inquiries/InquiriesScreen';
import CarriersScreen from '../screens/carriers/CarriersScreen';
import CustomersScreen from '../screens/customers/CustomersScreen';
import StatsScreen from '../screens/stats/StatsScreen';

// The bare address opens the screen chosen in Settings. Waits for the
// user's settings, then moves once; the query string (Google sign-in
// results) is kept for the hooks that read it.
function OpeningScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, loaded } = useSettings();
  const done = useRef(false);
  useEffect(() => {
    if (location.pathname !== '/' || done.current || !loaded) return;
    done.current = true;
    navigate({ pathname: `/${settings.board.openingTab || 'loads'}`, search: location.search }, { replace: true });
  }, [location.pathname, location.search, navigate, settings.board.openingTab, loaded]);
  return null;
}

function Screen({ tab, refreshKey, focusedMatchLoad, onViewMatches, onClearFocusedLoad }) {
  switch (tab) {
    case 'inquiries':
      return <InquiriesScreen refreshKey={refreshKey} />;
    case 'carriers':
      return <CarriersScreen focusedLoad={focusedMatchLoad} onClearFocusedLoad={onClearFocusedLoad} />;
    case 'customers':
      return <CustomersScreen />;
    case 'stats':
      return <StatsScreen />;
    default:
      return <LoadsScreen refreshKey={refreshKey} onViewMatches={onViewMatches} />;
  }
}

function MainToolPage({ username, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Settings opens over whichever screen it was opened from.
  const basePath = location.pathname.startsWith('/settings') ? location.state?.from || '/loads' : location.pathname;
  const tab = tabFromPath(basePath);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusedMatchLoad, setFocusedMatchLoad] = useState(null);

  function handleViewMatches(load) {
    setFocusedMatchLoad(load);
    navigate('/carriers/find');
  }

  useHotkeys({ '/': focusPageSearch });

  return (
    <AppShell username={username} onLogout={onLogout} onLoadsImported={() => setRefreshKey((k) => k + 1)} mapDimmed={false}>
      <OpeningScreen />
      {/* Each screen's panels are position: fixed, so no animated wrapper
          sits around them (it would become their containing block); each
          panel animates itself in. */}
      <main key={tab}>
        {location.pathname !== '/' && (
        <Screen
          tab={tab}
          refreshKey={refreshKey}
          focusedMatchLoad={focusedMatchLoad}
          onViewMatches={handleViewMatches}
          onClearFocusedLoad={() => setFocusedMatchLoad(null)}
        />
        )}
      </main>
    </AppShell>
  );
}

export default MainToolPage;

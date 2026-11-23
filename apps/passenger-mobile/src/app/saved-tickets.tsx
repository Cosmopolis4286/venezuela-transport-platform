import { SavedTicketsView } from '@/components/saved-tickets-view';

/** Public on purpose: the saved tickets open without signal even after the session ended. */
export default function SavedTicketsScreen() {
  return <SavedTicketsView />;
}

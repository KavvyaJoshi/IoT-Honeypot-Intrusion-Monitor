import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../components/ui/Card.jsx';
import { EmptyState } from '../components/ui/States.jsx';

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This dashboard page does not exist."
        action={
          <Link to="/" className="text-sm font-medium text-accent-ink hover:text-accent">
            Back to overview
          </Link>
        }
      />
    </Card>
  );
}

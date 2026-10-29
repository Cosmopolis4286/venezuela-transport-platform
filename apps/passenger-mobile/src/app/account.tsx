import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  LanguagePicker,
  Row,
  Screen,
  Subheading,
  useAuth,
  useCurrentUser,
} from '@vtp/mobile-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { useT } from '@/i18n/use-t';

export default function Account() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <Screen>
      <Heading>{t.account.hello(name ? user.firstName : null)}</Heading>
      <Card>
        <Subheading>{t.account.yourAccount}</Subheading>
        {name ? <Body>{name}</Body> : null}
        {user.email ? (
          <Row>
            <Body>{user.email}</Body>
            <Badge
              label={user.emailVerified ? t.account.verified : t.account.unverified}
              tone={user.emailVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
        {user.phone ? (
          <Row>
            <Body>{user.phone}</Body>
            <Badge
              label={user.phoneVerified ? t.account.verified : t.account.unverified}
              tone={user.phoneVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
      </Card>
      <Button title={t.account.myTrips} onPress={() => router.push('/bookings')} />
      <Button
        variant="secondary"
        title={t.account.signOut}
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
      />
      <LanguagePicker />
    </Screen>
  );
}

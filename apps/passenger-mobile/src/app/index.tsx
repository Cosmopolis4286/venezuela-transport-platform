import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  Subheading,
  useAuth,
  useCurrentUser,
} from '@vtp/mobile-core';
import { useState } from 'react';

export default function Home() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <Screen>
      <Heading>{name ? `Hola, ${user.firstName}` : 'Hola'}</Heading>
      <Banner tone="info">
        Muy pronto podrás buscar rutas, comparar horarios y comprar tus boletos desde aquí.
      </Banner>
      <Card>
        <Subheading>Tu cuenta</Subheading>
        {name ? <Body>{name}</Body> : null}
        {user.email ? (
          <Row>
            <Body>{user.email}</Body>
            <Badge
              label={user.emailVerified ? 'Verificado' : 'Sin verificar'}
              tone={user.emailVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
        {user.phone ? (
          <Row>
            <Body>{user.phone}</Body>
            <Badge
              label={user.phoneVerified ? 'Verificado' : 'Sin verificar'}
              tone={user.phoneVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
      </Card>
      <Button
        variant="secondary"
        title="Cerrar sesión"
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
      />
    </Screen>
  );
}

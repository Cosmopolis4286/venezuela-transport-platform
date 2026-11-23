import { Badge, Banner, Body, Card, Heading, Row } from '@vtp/mobile-core';
import { localTime, type TicketValidation } from '@vtp/shared-types';
import { ticketVerdict } from './ticket-result';

/** Whether the passenger may board, and whose ticket it is (scanner and trip screen). */
export function ResultCard({ result }: { result: TicketValidation }) {
  const verdict = ticketVerdict(result);
  return (
    <>
      <Banner tone={verdict.tone}>
        {verdict.title}
        {verdict.detail ? `\n${verdict.detail}` : ''}
      </Banner>
      <Card>
        <Row>
          <Badge label={`Puesto ${result.seatNumber}`} tone={verdict.ok ? 'success' : 'neutral'} />
          <Badge label={result.bookingCode} />
        </Row>
        <Heading>{result.passengerName}</Heading>
        <Body>{result.documentNumber}</Body>
        <Body muted>
          {result.from.city} → {result.to.city} · sale {localTime(result.departsAt)}
        </Body>
        <Body muted>{result.route.name}</Body>
      </Card>
    </>
  );
}

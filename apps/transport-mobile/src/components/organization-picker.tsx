import {
  ORGANIZATION_TYPE_LABELS,
  ROLES_BY_ORGANIZATION_TYPE,
  type ApplicationRole,
  type OrganizationDirectoryEntry,
} from '@vtp/shared-types';
import { Banner, Body, Button, Card, Field, Row, useApi } from '@vtp/mobile-core';
import { useEffect, useState } from 'react';

/** Debounced search over active organizations that have the role the applicant wants. */
export function OrganizationPicker({
  role,
  selected,
  onSelect,
}: {
  role: ApplicationRole;
  selected: Pick<OrganizationDirectoryEntry, 'id' | 'legalName'> | null;
  onSelect: (organization: OrganizationDirectoryEntry | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useApi<OrganizationDirectoryEntry[]>(
    selected ? null : `/organizations/directory?q=${encodeURIComponent(debounced)}`,
  );
  const matching = (results.data ?? []).filter((organization) =>
    ROLES_BY_ORGANIZATION_TYPE[organization.type].includes(role),
  );

  if (selected) {
    return (
      <Card>
        <Body>{selected.legalName}</Body>
        <Button variant="link" title="Cambiar de empresa" onPress={() => onSelect(null)} />
      </Card>
    );
  }

  return (
    <>
      <Field
        label="Empresa, línea o terminal (opcional)"
        placeholder="Busca por nombre"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        hint="Si la eliges, podrá incorporarte cuando tu identidad sea verificada."
      />
      {results.error ? <Banner tone="error">{results.error.userMessage}</Banner> : null}
      {matching.slice(0, 8).map((organization) => (
        <Card key={organization.id}>
          <Body>{organization.tradeName ?? organization.legalName}</Body>
          <Row>
            <Body muted>
              {[ORGANIZATION_TYPE_LABELS[organization.type], organization.city]
                .filter(Boolean)
                .join(' · ')}
            </Body>
          </Row>
          <Button variant="secondary" title="Elegir" onPress={() => onSelect(organization)} />
        </Card>
      ))}
      {results.data && debounced && matching.length === 0 ? (
        <Body muted>No encontramos organizaciones activas con ese nombre.</Body>
      ) : null}
    </>
  );
}

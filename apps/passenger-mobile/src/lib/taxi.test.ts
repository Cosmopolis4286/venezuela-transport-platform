import { driverLine, isOpenRide } from './taxi';

describe('taxi helpers', () => {
  it('knows which rides are still open', () => {
    expect(isOpenRide({ status: 'requested' })).toBe(true);
    expect(isOpenRide({ status: 'in_progress' })).toBe(true);
    expect(isOpenRide({ status: 'completed' })).toBe(false);
    expect(isOpenRide({ status: 'expired' })).toBe(false);
  });

  it('shows the driver with a local phone number', () => {
    expect(driverLine({ firstName: 'Carlos', lastName: 'Pérez', phone: '+584141234567' })).toBe(
      'Carlos Pérez · 0414-1234567',
    );
    expect(driverLine({ firstName: null, lastName: null, phone: null })).toBe('Conductor');
    expect(driverLine(null)).toBeNull();
  });
});

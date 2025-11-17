import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from '../metric-card';

describe('MetricCard', () => {
  it('should render title, value, and description', () => {
    render(
      <MetricCard
        title="Active Signals"
        value={10}
        description="High EV opportunities"
      />
    );

    expect(screen.getByText('Active Signals')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('High EV opportunities')).toBeInTheDocument();
  });

  it('should render string values', () => {
    render(
      <MetricCard
        title="Average EV"
        value="5.2%"
        description="Expected value"
      />
    );

    expect(screen.getByText('Average EV')).toBeInTheDocument();
    expect(screen.getByText('5.2%')).toBeInTheDocument();
    expect(screen.getByText('Expected value')).toBeInTheDocument();
  });

  it('should render numeric values', () => {
    render(
      <MetricCard
        title="Total Contracts"
        value={42}
        description="Available contracts"
      />
    );

    expect(screen.getByText('Total Contracts')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Available contracts')).toBeInTheDocument();
  });

  it('should apply glass-metric styling', () => {
    const { container } = render(
      <MetricCard
        title="Test"
        value={100}
        description="Test description"
      />
    );

    const card = container.querySelector('.glass-metric');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass('rounded-2xl');
    expect(card).toHaveClass('p-4');
  });

  it('should render with different value types', () => {
    const values = [
      { value: 0, expected: '0' },
      { value: 100, expected: '100' },
      { value: 'N/A', expected: 'N/A' },
      { value: '52.0%', expected: '52.0%' },
      { value: 'ELEVATED', expected: 'ELEVATED' },
    ];

    values.forEach(({ value, expected }) => {
      const { rerender } = render(
        <MetricCard
          title="Test"
          value={value}
          description="Test"
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();

      rerender(<MetricCard title="" value="" description="" />);
    });
  });

  it('should handle zero values correctly', () => {
    render(
      <MetricCard
        title="Active Signals"
        value={0}
        description="No signals"
      />
    );

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should render description with proper styling', () => {
    const { container } = render(
      <MetricCard
        title="Test"
        value="100"
        description="Test description"
      />
    );

    const description = screen.getByText('Test description');
    expect(description).toHaveClass('text-xs');
    expect(description).toHaveClass('text-muted-foreground');
  });
});

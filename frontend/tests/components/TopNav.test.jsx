import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TopNav from '../../src/components/TopNav';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

describe('TopNav', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    liveSocket.subscribe.mockReturnValue(() => {});
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'a@b.com' });
    inquiriesApi.listInquiries.mockResolvedValue([]);
  });

  test('renders both nav items and the username', () => {
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^loads$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  test('marks the active tab with aria-current', () => {
    render(<TopNav tab="inquiries" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /^loads$/i })).not.toHaveAttribute('aria-current');
  });

  test('calls onTabChange with the clicked tab', () => {
    const onTabChange = vi.fn();
    render(<TopNav tab="loads" onTabChange={onTabChange} username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    expect(onTabChange).toHaveBeenCalledWith('inquiries');
  });

  test('calls onLogout when the log out button is clicked', () => {
    const onLogout = vi.fn();
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  test('renders the theme toggle', () => {
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /switch to (dark|light) theme/i })).toBeInTheDocument();
  });

  test('renders the live-connection status indicator next to the username', () => {
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  test('shows a nudge badge on Inquiries when Gmail is not connected, without changing the button\'s accessible name', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('gmail-nudge-badge')).toBeInTheDocument();
    });
    // the badge is decorative -- the nav button's name must stay exactly "Inquiries"
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toBeInTheDocument();
  });

  test('does not show a nudge badge when Gmail is already connected', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'a@b.com' });
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(gmailApi.getGmailStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('gmail-nudge-badge')).not.toBeInTheDocument();
  });

  test('shows a pending-review count badge on Inquiries, without changing the button\'s accessible name', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('pending-review-badge')).toHaveTextContent('3');
    });
    expect(inquiriesApi.listInquiries).toHaveBeenCalledWith('pending_review');
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toBeInTheDocument();
  });

  test('does not show a pending-review badge when the queue is empty', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalled());
    expect(screen.queryByTestId('pending-review-badge')).not.toBeInTheDocument();
  });

  test('the Gmail nudge takes precedence over the pending-review count when both would apply', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }]);
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('gmail-nudge-badge')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('pending-review-badge')).not.toBeInTheDocument();
  });

  test('updates the pending-review count live when an inquiry:new event arrives', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    let inquiryNewHandler;
    liveSocket.subscribe.mockImplementation((event, handler) => {
      if (event === 'inquiry:new') inquiryNewHandler = handler;
      return () => {};
    });
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('pending-review-badge')).not.toBeInTheDocument();

    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }]);
    inquiryNewHandler({ id: 1, reply_status: 'pending_review' });

    await waitFor(() => {
      expect(screen.getByTestId('pending-review-badge')).toHaveTextContent('1');
    });
  });
});

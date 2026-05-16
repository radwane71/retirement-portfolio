const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

const CHART_COLORS = [
  '#f0b429','#3b82f6','#22c55e','#a855f7',
  '#ef4444','#06b6d4','#f97316','#ec4899',
  '#84cc16','#8b5cf6','#14b8a6','#f43f5e'
];

function formatSAR(amount, showSign = false) {
  const num = parseFloat(amount) || 0;
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = showSign ? (num >= 0 ? '+' : '-') : (num < 0 ? '-' : '');
  return `${sign}${formatted} ر.س`;
}

function formatNum(num, decimals = 2) {
  return (parseFloat(num) || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function calcCommission(shares, price) {
  const tradeValue = parseFloat(shares) * parseFloat(price);
  const commission = Math.min(tradeValue * 0.0015, 100);
  const vat = commission * 0.15;
  return {
    tradeValue,
    commission: parseFloat(commission.toFixed(4)),
    vat: parseFloat(vat.toFixed(4)),
    totalBuy:  parseFloat((tradeValue + commission + vat).toFixed(4)),
    totalSell: parseFloat((tradeValue - commission - vat).toFixed(4))
  };
}

function setActiveNav(linkId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const el = document.getElementById(linkId);
  if (el) el.classList.add('active');
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#8b949e',
          font: { family: 'Tajawal', size: 12 },
          padding: 14,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: '#1c2128',
        titleColor: '#e6edf3',
        bodyColor: '#8b949e',
        borderColor: '#30363d',
        borderWidth: 1,
        padding: 10,
        titleFont: { family: 'Tajawal' },
        bodyFont: { family: 'Tajawal' }
      }
    },
    scales: {
      x: {
        ticks: { color: '#8b949e', font: { family: 'Tajawal' } },
        grid: { color: 'rgba(48,54,61,0.6)' }
      },
      y: {
        ticks: { color: '#8b949e', font: { family: 'Tajawal' } },
        grid: { color: 'rgba(48,54,61,0.6)' }
      }
    }
  };
}

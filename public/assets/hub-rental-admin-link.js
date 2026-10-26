(function () {
  function addRentalAdminLink() {
    if (document.querySelector('[data-rental-admin-link]')) return true;
    const booking = Array.from(document.querySelectorAll('a[href="/booking"],a[href="/booking/"]'))[0];
    if (!booking || !booking.parentElement) return false;
    const link = document.createElement('a');
    link.href = '/admin/rentals/';
    link.setAttribute('data-rental-admin-link','1');
    link.textContent = 'Rental applications';
    link.className = booking.className;
    link.style.marginLeft = '8px';
    booking.insertAdjacentElement('afterend', link);
    if (!document.querySelector('[data-preview-admin-link]')) {
      const preview = document.createElement('a');
      preview.href = '/admin/previews/';
      preview.setAttribute('data-preview-admin-link','1');
      preview.textContent = 'Preview library';
      preview.className = booking.className;
      preview.style.marginLeft = '8px';
      link.insertAdjacentElement('afterend', preview);
    }
    return true;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addRentalAdminLink, { once:true });
  } else {
    addRentalAdminLink();
  }
  const observer = new MutationObserver(() => {
    if (addRentalAdminLink()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(() => observer.disconnect(), 15000);
})();
/* Label the existing React tables without copying records or replacing handlers. */
(() => {
    function labelTables() {
        document.querySelectorAll('main table').forEach(table => {
            table.classList.add('mobile-table');
            table.parentElement.classList.add('mobile-table-panel');
            table.parentElement.setAttribute('tabindex', '0');
            table.setAttribute('role', 'table');
            const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
            table.querySelectorAll('thead, tbody').forEach(group => group.setAttribute('role', 'rowgroup'));
            table.querySelectorAll('tr').forEach(row => row.setAttribute('role', 'row'));
            table.querySelectorAll('th').forEach(th => th.setAttribute('role', 'columnheader'));
            table.querySelectorAll('tbody tr').forEach(row => {
                [...row.children].forEach((cell, index) => {
                    cell.setAttribute('role', 'cell');
                    if (!cell.hasAttribute('colspan') && headings[index]) cell.dataset.label = headings[index];
                });
            });
        });
    }
    const observer = new MutationObserver(labelTables);
    observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    labelTables();
})();

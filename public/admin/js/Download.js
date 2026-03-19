(function ($) {
  "use strict";

  let currentDownloadData = [];

  // -------------------------
  // Recursive flattening function
  // -------------------------
  function flattenObject(obj, parentKey = "", res = {}) {
    for (let key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      const value = obj[key];
      const newKey = parentKey ? `${parentKey}.${key}` : key;

      if (Array.isArray(value)) {
        if (value.length && typeof value[0] === "object") {
          res[newKey] = value.map((v) => v.title || JSON.stringify(v)).join(", ");
        } else {
          res[newKey] = value.join(", ");
        }
      } else if (value && typeof value === "object") {
        flattenObject(value, newKey, res);
      } else {
        res[newKey] = value;
      }
    }
    return res;
  }

  // -------------------------
  // Helper: get nested value by dot notation
  // -------------------------
  function getNestedValue(obj, path) {
    if (!obj || !path) return "";
    return path.split(".").reduce((acc, key) => {
      if (acc && acc.hasOwnProperty(key)) return acc[key];
      return "";
    }, obj);
  }

  // -------------------------
  // Main function: Download Table Data
  // -------------------------
  function downloadTableData(options) {
    const defaults = {
      access: window.authUser?.access,
      ownerAttr: 'createdBy',
      role: window.authUser?.role?.title.toLowerCase(),
      ownerValue: window.authUser?.id,
      api: "",
      option: {},
      filterCols: [],
    };
    const settings = { ...defaults, ...options };

    if (!settings.api) {
      alert("API endpoint is required.");
      return;
    }

    // -------------------------
    // ROLE-BASED FILTERING BEFORE API CALL (server side)
    // -------------------------
    if (settings.role !== 'admin' && settings.access !== 'full') {
      settings.option[settings.ownerAttr] = settings.ownerValue;
    }
    settings.option['limit'] = 'all'; // Max records to fetch
    // -------------------------
    // FETCH DATA FROM API
    // -------------------------
    $.getJSON(api(settings.api), settings.option)
      .done(function (res) {
        const data = res.data || [];
        if (!data.length) {
          alert("No data to download");
          return;
        }

        currentDownloadData = data;

        const columns = Object.keys(flattenObject(data[0]));

        // -------------------------
        // BUILD FILTER DROPDOWNS
        // -------------------------
        let filterHtml = "";
        if (settings.filterCols && settings.filterCols.length) {
          settings.filterCols.forEach((col) => {
            let colName = col;
            let valueField = null;
            let labelField = null;

            if (typeof col === "object") {
              colName = col.col;
              valueField = col.valueField;
              labelField = col.labelField;
            }

            const uniqueValues = [
              ...new Set(data.map((r) => getNestedValue(r, colName))),
            ];

            let optionsHtml = "";
            if (valueField && labelField) {
              const vals = [];
              data.forEach((r) => {
                const arr = getNestedValue(r, colName);
                if (Array.isArray(arr)) {
                  arr.forEach((v) => {
                    if (!vals.find((x) => x.value == v[valueField])) {
                      vals.push({ value: v[valueField], label: v[labelField] });
                    }
                  });
                }
              });
              optionsHtml = vals
                .map((v) => `<option value="${v.value}">${v.label}</option>`)
                .join("");
            } else {
              optionsHtml = uniqueValues
                .map((v) => {
                  let label = v;
                  if (colName.toLowerCase() === "status") {
                    label = v == 1 ? "Active" : v == 0 ? "Inactive" : v;
                  }
                  return `<option value="${v}">${label}</option>`;
                })
                .join("");
            }

            filterHtml += `
              <div class="psr-form-group filter-group" style="margin-bottom: 0;">
                <label class="psr-form-label" style="font-weight: 600; font-size: 13px; color: #4b5563; margin-bottom: 8px; display: block;">${colName.toUpperCase()}</label>
                <select class="psr-form-input psr-form-select dl-filter" data-col="${colName}" style="width: 100%; height: 42px; border-radius: 8px; padding: 0 15px;">
                  <option value="">All</option>
                  ${optionsHtml}
                </select>
              </div>
            `;
          });
        }

        // -------------------------
        // SHOW MODAL
        // -------------------------
        const modalHtml = `
<div class="psr-modal-overlay active" id="downloadModal" style="z-index: 1100;">
  <div class="psr-modal" style="width: 550px !important; max-width: 90vw;">
    <div class="psr-modal-header">
      <h3 class="psr-modal-title"><i class="fa-solid fa-cloud-arrow-down" style="margin-right: 10px; color: var(--clr-brand);"></i>Export Data</h3>
      <button class="psr-modal-close" id="dl-close">&times;</button>
    </div>
    <div class="psr-modal-body" style="padding: 25px;">
      <div class="psr-row" style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
        <div class="psr-form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
          <label class="psr-form-label" style="font-weight: 600; font-size: 13px; color: #4b5563; margin-bottom: 8px; display: block;">FORMAT</label>
          <select class="psr-form-input psr-form-select" id="dl-filetype" style="width: 100%; height: 42px; border-radius: 8px; padding: 0 15px;">
            <option value="excel">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="image">PNG Image (.png)</option>
          </select>
        </div>
        
        <!-- FILTERS (If any) -->
        ${filterHtml ? `<div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 10px;">${filterHtml}</div>` : ''}
      </div>

      <div class="psr-column-selection-wrapper" style="margin-top: 25px;">
        <label class="psr-form-label" style="font-weight: 600; font-size: 13px; color: #4b5563; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          SELECT COLUMNS
          <span style="font-weight: 400; font-size: 11px; color: var(--clr-brand); cursor: pointer;" id="dl-toggle-all">Select All/None</span>
        </label>
        <div class="psr-dl-columns-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-height: 250px; overflow-y: auto; padding: 15px; background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6;">
          ${columns
            .map(
              (col) =>
                `<label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #374151; cursor: pointer; padding: 5px; border-bottom: 1px solid #f1f5f9;">
                  <input type="checkbox" class="dl-column" value="${col}" checked style="accent-color: var(--clr-brand); width: 16px; height: 16px;"> 
                  ${col.split('.').pop().replace(/_/g, ' ').toUpperCase()}
                </label>`
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="psr-modal-footer" style="padding: 20px 25px; background: #fafbfc; border-radius: 0 0 16px 16px; display: flex; justify-content: flex-end; gap: 12px;">
      <button class="psr-btn psr-btn-secondary" id="dl-cancel" style="min-width: 100px;">Cancel</button>
      <button class="psr-btn psr-btn-primary" id="dl-confirm" style="min-width: 120px;"><i class="fa-solid fa-download" style="margin-right: 8px;"></i>Download</button>
    </div>
  </div>
</div>
`;
        $("body").append(modalHtml);

        $("#dl-close, #dl-cancel").on("click", () => $("#downloadModal").remove());

        $("#dl-toggle-all").on("click", function () {
          const allChecked = $(".dl-column:checked").length === $(".dl-column").length;
          $(".dl-column").prop("checked", !allChecked);
        });

        // -------------------------
        // DOWNLOAD BUTTON HANDLER
        // -------------------------
        $("#dl-confirm").on("click", function () {
          const btn = $(this);
          const filters = {};
          $(".dl-filter").each((i, el) => {
            const col = $(el).data("col");
            const val = $(el).val();
            if (val !== "") filters[col] = val;
          });

          let finalData = currentDownloadData.filter((row) =>
            Object.entries(filters).every(([col, val]) => {
              const rowVal = getNestedValue(row, col);
              return String(rowVal) === String(val);
            })
          );

          const selectedCols = $(".dl-column:checked")
            .map((i, el) => el.value)
            .get();

          if (!selectedCols.length) {
            toastr.warning("Please select at least one column.");
            return;
          }

          const fileType = $("#dl-filetype").val();
          const fileName = settings.api.split("/").pop() || "data";

          // Close modal and show processing
          $("#downloadModal").remove();
          const toast = toastr.info("Preparing your " + fileType + " file...", "Processing", {
            timeOut: 0,
            extendedTimeOut: 0,
            closeButton: false,
            progressBar: true
          });

          // Brief delay to allow UI to update (modal remove) before heavy processing
          setTimeout(() => {
            try {
              generateFile(finalData, selectedCols, fileType, fileName);
              toastr.clear(toast);
              toastr.success("Download started successfully!");
            } catch (err) {
              toastr.clear(toast);
              toastr.error("Export failed: " + err.message);
              console.error(err);
            }
          }, 100);
        });
      })
      .fail(function (err) {
        alert("Error fetching data: " + err.responseText);
      });
  }

  // -------------------------
  // Generate file based on type
  // -------------------------
  function generateFile(data, columns, fileType, fileName) {
    const filteredData = data.map((row) => {
      const flatRow = flattenObject(row);
      const obj = {};
      columns.forEach((c) => {
        obj[c] = flatRow[c] !== undefined ? flatRow[c] : "";
      });
      return obj;
    });

    if (fileType === "csv") exportCSV(filteredData, fileName);
    else if (fileType === "excel") exportExcel(filteredData, fileName);
    else if (fileType === "pdf") exportPDF(filteredData, fileName);
    else if (fileType === "image") exportImage(filteredData, fileName);
  }

  // -------------------------
  // Export functions
  // -------------------------
  function exportCSV(data, fileName) {
    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((r) => Object.values(r).map((v) => `"${v}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportExcel(data, fileName) {
    if (!window.XLSX) { alert("XLSX library not loaded"); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  function exportPDF(data, fileName) {
    if (!window.pdfMake) { alert("pdfMake library not loaded"); return; }

    const columns = Object.keys(data[0]);
    const body = [columns];

    data.forEach((row) => {
      const r = columns.map((c) => ({ text: row[c] !== undefined ? String(row[c]) : "", noWrap: false }));
      body.push(r);
    });

    const docDefinition = {
      pageOrientation: "landscape",
      pageSize: "A4",
      pageMargins: [20, 20, 20, 20],
      content: [{ text: fileName, style: "header" }, { table: { headerRows: 1, widths: columns.map(() => 80), body }, layout: { fillColor: (rowIndex) => (rowIndex === 0 ? "#CCCCCC" : null), hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2 } }],
      styles: { header: { fontSize: 14, bold: true, margin: [0, 0, 0, 10] } },
      defaultStyle: { fontSize: 10 },
    };

    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
  }

  function exportImage(data, fileName) {
    if (!window.html2canvas) { alert("html2canvas library not loaded"); return; }

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.background = "#fff";
    table.style.color = "#000";
    table.style.fontSize = "12px";
    table.style.tableLayout = "auto";

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    Object.keys(data[0]).forEach((c) => {
      const th = document.createElement("th");
      th.style.border = "1px solid #000";
      th.style.padding = "6px";
      th.style.fontWeight = "bold";
      th.innerText = c;
      headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    data.forEach((r) => {
      const tr = tbody.insertRow();
      Object.keys(r).forEach((c) => {
        const td = tr.insertCell();
        td.style.border = "1px solid #000";
        td.style.padding = "4px";
        td.style.wordWrap = "break-word";
        td.style.maxWidth = "300px";
        td.innerText = r[c];
      });
    });

    document.body.appendChild(table);
    const scale = 3;
    html2canvas(table, { scale, useCORS: true, backgroundColor: "#fff", scrollX: 0, scrollY: 0, windowWidth: document.body.scrollWidth, windowHeight: document.body.scrollHeight })
      .then((canvas) => {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png", 1.0);
        a.download = `${fileName}.png`;
        a.click();
        table.remove();
      });
  }

  // -------------------------
  // Bind button
  // -------------------------
  $(document).on("click", ".js-download-data", function () {
    const apiOption = $(this).attr("data-api-option") ? JSON.parse($(this).attr("data-api-option")) : {};
    const filterCols = $(this).attr("data-filter-cols") ? JSON.parse($(this).attr("data-filter-cols")) : [];

    downloadTableData({
      api: $(this).data("api"),
      ownerAttr: $(this).data("owner-field"),
      ownerValue: $(this).data("owner-value"),
      option: apiOption,
      filterCols: filterCols,
    });
  });

})(jQuery);

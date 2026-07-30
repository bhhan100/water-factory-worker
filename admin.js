/* =========================================================
   水厂管家老板端 V2.0
   文件：admin.js
   ========================================================= */


/* =========================
   1. 基础变量
   ========================= */

const STORAGE_KEY = "waterFactoryOrdersV2";

let orders = [];
let incomeChart = null;
let productChart = null;
let analysisIncomeChart = null;
let analysisProductChart = null;


/* 产品名称兼容表 */

const PRODUCT_ALIASES = {
  bottle: "瓶装水",
  bottled: "瓶装水",
  bottledWater: "瓶装水",
  瓶装水: "瓶装水",

  pusu: "普苏",
  普苏: "普苏",

  barrel: "循环桶",
  returnable: "循环桶",
  循环桶: "循环桶",

  barrelBack: "循环桶回桶",
  returnBarrel: "循环桶回桶",
  循环桶回桶: "循环桶回桶",

  disposable: "一次性桶",
  一次性: "一次性桶",
  一次性桶: "一次性桶",

  custom: "定制水",
  customized: "定制水",
  定制水: "定制水"
};


/* 产品图表颜色 */

const PRODUCT_COLORS = [
  "#1677ff",
  "#16a76a",
  "#f59e0b",
  "#7c5cff",
  "#ef4444",
  "#06b6d4",
  "#64748b"
];


/* =========================
   2. 页面初始化
   ========================= */

document.addEventListener("DOMContentLoaded", function () {
  updateTodayText();
  loadOrders();
  renderAll();
  bindKeyboardEvents();
});


/* =========================
   3. 日期相关
   ========================= */

function updateTodayText() {
  const element = document.getElementById("todayText");

  if (!element) {
    return;
  }

  const now = new Date();

  const weekNames = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六"
  ];

  const text =
    `${now.getFullYear()}年` +
    `${now.getMonth() + 1}月` +
    `${now.getDate()}日 ` +
    `${weekNames[now.getDay()]}`;

  element.textContent = text;
}


function getDateKey(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getTodayKey() {
  return getDateKey(new Date());
}


function getYesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return getDateKey(date);
}


function formatDateTime(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}


/* =========================
   4. 读取订单数据
   ========================= */

function loadOrders() {
  const possibleKeys = [
    STORAGE_KEY,
    "waterFactoryOrders",
    "orders",
    "water_orders",
    "waterFactoryData"
  ];

  let storedData = null;

  for (const key of possibleKeys) {
    const value = localStorage.getItem(key);

    if (value) {
      storedData = value;
      break;
    }
  }

  if (!storedData) {
    orders = [];
    return;
  }

  try {
    const parsed = JSON.parse(storedData);

    if (Array.isArray(parsed)) {
      orders = parsed.map(normalizeOrder);
      return;
    }

    if (parsed && Array.isArray(parsed.orders)) {
      orders = parsed.orders.map(normalizeOrder);
      return;
    }

    orders = [];
  } catch (error) {
    console.error("订单数据读取失败：", error);
    orders = [];
  }
}


function saveOrders() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(orders)
    );
  } catch (error) {
    console.error("订单保存失败：", error);
  }
}


/* =========================
   5. 数据标准化
   ========================= */

function normalizeOrder(rawOrder) {
  const customerName =
    rawOrder.customerName ||
    rawOrder.customer ||
    rawOrder.clientName ||
    rawOrder.name ||
    "未命名客户";

  const date =
    rawOrder.date ||
    rawOrder.createdAt ||
    rawOrder.time ||
    rawOrder.orderDate ||
    new Date().toISOString();

  const items = normalizeItems(rawOrder);

  const calculatedAmount = items.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const totalAmount = toNumber(
    rawOrder.totalAmount ??
    rawOrder.total ??
    rawOrder.amount ??
    rawOrder.money ??
    calculatedAmount
  );

  const paidAmount = toNumber(
    rawOrder.paidAmount ??
    rawOrder.receivedAmount ??
    rawOrder.paid ??
    getPaidAmountByStatus(rawOrder.paymentStatus, totalAmount)
  );

  let debtAmount = toNumber(
    rawOrder.debtAmount ??
    rawOrder.unpaidAmount ??
    rawOrder.debt ??
    totalAmount - paidAmount
  );

  debtAmount = Math.max(0, debtAmount);

  const paymentStatus =
    normalizePaymentStatus(
      rawOrder.paymentStatus,
      totalAmount,
      paidAmount,
      debtAmount
    );

  const barrelOut = toNumber(
    rawOrder.barrelOut ??
    rawOrder.sentBarrels ??
    rawOrder.borrowedBarrels ??
    getItemQuantity(items, "循环桶")
  );

  const barrelBack = toNumber(
    rawOrder.barrelBack ??
    rawOrder.returnedBarrels ??
    rawOrder.returnBarrels ??
    getItemQuantity(items, "循环桶回桶")
  );

  return {
    id:
      rawOrder.id ||
      `ORDER-${Date.now()}-${Math.random().toString(16).slice(2)}`,

    customerName,
    phone: rawOrder.phone || rawOrder.customerPhone || "",
    address: rawOrder.address || rawOrder.customerAddress || "",

    date,
    items,

    totalAmount,
    paidAmount,
    debtAmount,
    paymentStatus,

    barrelOut,
    barrelBack,

    remark: rawOrder.remark || rawOrder.note || ""
  };
}


function normalizeItems(rawOrder) {
  const sourceItems =
    rawOrder.items ||
    rawOrder.products ||
    rawOrder.orderItems;

  if (Array.isArray(sourceItems)) {
    return sourceItems
      .map(normalizeItem)
      .filter(item => item.quantity !== 0);
  }

  const generatedItems = [];

  const quantityFields = [
    ["瓶装水", rawOrder.bottle ?? rawOrder.bottledWater],
    ["普苏", rawOrder.pusu],
    ["循环桶", rawOrder.barrel ?? rawOrder.returnable],
    ["循环桶回桶", rawOrder.barrelBack ?? rawOrder.returnBarrel],
    ["一次性桶", rawOrder.disposable],
    ["定制水", rawOrder.custom ?? rawOrder.customized]
  ];

  quantityFields.forEach(([name, value]) => {
    const quantity = toNumber(value);

    if (quantity !== 0) {
      generatedItems.push({
        name,
        quantity,
        price: 0,
        amount: 0
      });
    }
  });

  return generatedItems;
}


function normalizeItem(rawItem) {
  const rawName =
    rawItem.name ||
    rawItem.productName ||
    rawItem.product ||
    rawItem.type ||
    "其他产品";

  const name = PRODUCT_ALIASES[rawName] || rawName;

  const quantity = toNumber(
    rawItem.quantity ??
    rawItem.qty ??
    rawItem.count ??
    rawItem.number
  );

  const price = toNumber(
    rawItem.price ??
    rawItem.unitPrice
  );

  const amount = toNumber(
    rawItem.amount ??
    rawItem.subtotal ??
    quantity * price
  );

  return {
    name,
    quantity,
    price,
    amount
  };
}


function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}


function getItemQuantity(items, productName) {
  return items
    .filter(item => item.name === productName)
    .reduce((sum, item) => sum + item.quantity, 0);
}


function getPaidAmountByStatus(status, totalAmount) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (
    normalizedStatus === "paid" ||
    normalizedStatus === "已付款" ||
    normalizedStatus === "已结清"
  ) {
    return totalAmount;
  }

  return 0;
}


function normalizePaymentStatus(
  status,
  totalAmount,
  paidAmount,
  debtAmount
) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (
    normalizedStatus === "paid" ||
    normalizedStatus === "已付款" ||
    normalizedStatus === "已结清"
  ) {
    return "paid";
  }

  if (
    normalizedStatus === "partial" ||
    normalizedStatus === "部分付款" ||
    normalizedStatus === "部分支付"
  ) {
    return "partial";
  }

  if (
    normalizedStatus === "unpaid" ||
    normalizedStatus === "未付款" ||
    normalizedStatus === "欠款"
  ) {
    return "unpaid";
  }

  if (debtAmount <= 0 || paidAmount >= totalAmount) {
    return "paid";
  }

  if (paidAmount > 0) {
    return "partial";
  }

  return "unpaid";
}


/* =========================
   6. 菜单和页面切换
   ========================= */

function openMenu() {
  document
    .getElementById("sideMenu")
    ?.classList.add("open");

  document
    .getElementById("menuMask")
    ?.classList.add("show");

  document.body.style.overflow = "hidden";
}


function closeMenu() {
  document
    .getElementById("sideMenu")
    ?.classList.remove("open");

  document
    .getElementById("menuMask")
    ?.classList.remove("show");

  document.body.style.overflow = "";
}


function showPage(pageId, clickedButton) {
  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.classList.remove("active-page");
    });

  const targetPage = document.getElementById(pageId);

  if (targetPage) {
    targetPage.classList.add("active-page");
  }

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {
      button.classList.remove("active-nav");
    });

  let navigationButton = clickedButton;

  if (!navigationButton) {
    navigationButton = document.querySelector(
      `.nav-button[data-page="${pageId}"]`
    );
  }

  if (navigationButton) {
    navigationButton.classList.add("active-nav");
  }

  closeMenu();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "analysisPage") {
    setTimeout(renderAnalysisCharts, 100);
  }

  if (pageId === "customerPage") {
    renderCustomerPage();
  }

  if (pageId === "debtPage") {
    renderDebtPage();
  }

  if (pageId === "barrelPage") {
    renderBarrelPage();
  }
}


function bindKeyboardEvents() {
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}


/* =========================
   7. 总体刷新
   ========================= */

function renderAll() {
  renderDashboard();
  renderCustomerPage();
  renderDebtPage();
  renderBarrelPage();

  setTimeout(() => {
    renderHomeCharts();
  }, 80);
}


/* =========================
   8. 首页经营数据
   ========================= */

function renderDashboard() {
  const todayKey = getTodayKey();
  const yesterdayKey = getYesterdayKey();

  const todayOrders = orders.filter(
    order => getDateKey(order.date) === todayKey
  );

  const yesterdayOrders = orders.filter(
    order => getDateKey(order.date) === yesterdayKey
  );

  const todayIncome = sumOrderAmount(todayOrders);
  const yesterdayIncome = sumOrderAmount(yesterdayOrders);

  const todaySales = todayOrders.reduce(
    (sum, order) => {
      return sum + order.items
        .filter(item => item.name !== "循环桶回桶")
        .reduce(
          (itemSum, item) => itemSum + item.quantity,
          0
        );
    },
    0
  );

  const totalDebt = orders.reduce(
    (sum, order) => sum + order.debtAmount,
    0
  );

  const customerCount = getCustomerStatistics().length;

  const barrelOut = orders.reduce(
    (sum, order) => sum + order.barrelOut,
    0
  );

  const barrelBack = orders.reduce(
    (sum, order) => sum + order.barrelBack,
    0
  );

  const barrelOwed = Math.max(
    0,
    barrelOut - barrelBack
  );

  setText(
    "todayIncome",
    formatMoney(todayIncome)
  );

  setText(
    "todayOrders",
    todayOrders.length
  );

  setText(
    "todaySales",
    todaySales
  );

  setText(
    "totalDebt",
    formatMoney(totalDebt)
  );

  setText(
    "customerCount",
    customerCount
  );

  setText(
    "barrelOut",
    barrelOut
  );

  setText(
    "barrelBack",
    barrelBack
  );

  setText(
    "barrelOwed",
    barrelOwed
  );

  renderIncomeTrend(
    todayIncome,
    yesterdayIncome
  );

  renderCustomerRanking();
  renderRecentOrders();
}


function sumOrderAmount(orderList) {
  return orderList.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );
}


function renderIncomeTrend(todayIncome, yesterdayIncome) {
  const element = document.getElementById("incomeTrend");

  if (!element) {
    return;
  }

  if (yesterdayIncome <= 0) {
    element.textContent =
      todayIncome > 0
        ? "今日新增收入"
        : "较昨日 0%";

    return;
  }

  const percentage =
    ((todayIncome - yesterdayIncome) /
      yesterdayIncome) *
    100;

  if (percentage > 0) {
    element.textContent =
      `较昨日 ↑ ${percentage.toFixed(1)}%`;

    element.style.color = "#d9ffea";
    element.style.background =
      "rgba(19, 166, 104, 0.24)";
  } else if (percentage < 0) {
    element.textContent =
      `较昨日 ↓ ${Math.abs(percentage).toFixed(1)}%`;

    element.style.color = "#ffe0e0";
    element.style.background =
      "rgba(239, 68, 68, 0.25)";
  } else {
    element.textContent = "较昨日 0%";
  }
}


/* =========================
   9. 客户统计
   ========================= */

function getCustomerStatistics() {
  const customerMap = new Map();

  orders.forEach(order => {
    const customerName =
      order.customerName || "未命名客户";

    if (!customerMap.has(customerName)) {
      customerMap.set(customerName, {
        name: customerName,
        phone: order.phone || "",
        address: order.address || "",
        orderCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        debtAmount: 0,
        barrelOut: 0,
        barrelBack: 0,
        barrelOwed: 0,
        quantity: 0,
        latestDate: order.date
      });
    }

    const customer = customerMap.get(customerName);

    customer.orderCount += 1;
    customer.totalAmount += order.totalAmount;
    customer.paidAmount += order.paidAmount;
    customer.debtAmount += order.debtAmount;
    customer.barrelOut += order.barrelOut;
    customer.barrelBack += order.barrelBack;

    customer.quantity += order.items
      .filter(item => item.name !== "循环桶回桶")
      .reduce(
        (sum, item) => sum + item.quantity,
        0
      );

    if (
      new Date(order.date).getTime() >
      new Date(customer.latestDate).getTime()
    ) {
      customer.latestDate = order.date;
    }

    if (!customer.phone && order.phone) {
      customer.phone = order.phone;
    }

    if (!customer.address && order.address) {
      customer.address = order.address;
    }
  });

  return Array
    .from(customerMap.values())
    .map(customer => ({
      ...customer,
      barrelOwed: Math.max(
        0,
        customer.barrelOut - customer.barrelBack
      )
    }));
}


/* =========================
   10. 首页客户排行榜
   ========================= */

function renderCustomerRanking() {
  const container =
    document.getElementById("customerRanking");

  if (!container) {
    return;
  }

  const customers = getCustomerStatistics()
    .sort(
      (a, b) => b.totalAmount - a.totalAmount
    )
    .slice(0, 5);

  if (customers.length === 0) {
    container.innerHTML =
      `<div class="empty-state">暂无客户数据</div>`;

    return;
  }

  container.innerHTML = customers
    .map((customer, index) => {
      return `
        <div class="ranking-item">

          <div class="ranking-number">
            ${index + 1}
          </div>

          <div class="customer-avatar">
            ${getCustomerAvatar(customer.name)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(customer.name)}
            </h4>

            <p>
              ${customer.orderCount}笔订单 ·
              ${customer.quantity}件产品
            </p>

          </div>

          <div class="list-value">

            <strong>
              ${formatMoney(customer.totalAmount)}
            </strong>

            <small>
              累计销售
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   11. 最近订单
   ========================= */

function renderRecentOrders() {
  const container =
    document.getElementById("recentOrders");

  if (!container) {
    return;
  }

  const recentOrders = [...orders]
    .sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    )
    .slice(0, 5);

  if (recentOrders.length === 0) {
    container.innerHTML =
      `<div class="empty-state">暂无订单</div>`;

    return;
  }

  container.innerHTML = recentOrders
    .map(order => {
      const status = getStatusInformation(
        order.paymentStatus
      );

      const productSummary =
        getProductSummary(order.items);

      return `
        <div class="order-item">

          <div class="customer-avatar">
            ${getCustomerAvatar(order.customerName)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(order.customerName)}
            </h4>

            <p>
              ${escapeHtml(productSummary)}
            </p>

            <span class="status-tag ${status.className}">
              ${status.text}
            </span>

          </div>

          <div class="list-value">

            <strong>
              ${formatMoney(order.totalAmount)}
            </strong>

            <small>
              ${formatDateTime(order.date)}
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   12. 客户管理页
   ========================= */

function renderCustomerPage() {
  const container =
    document.getElementById("customerList");

  if (!container) {
    return;
  }

  const keyword =
    document
      .getElementById("customerSearch")
      ?.value
      .trim()
      .toLowerCase() || "";

  const customers = getCustomerStatistics()
    .filter(customer => {
      const searchText =
        `${customer.name} ${customer.phone} ${customer.address}`
          .toLowerCase();

      return searchText.includes(keyword);
    })
    .sort(
      (a, b) => b.totalAmount - a.totalAmount
    );

  if (customers.length === 0) {
    container.innerHTML =
      `<div class="empty-state">没有找到客户</div>`;

    return;
  }

  container.innerHTML = customers
    .map(customer => {
      const debtText =
        customer.debtAmount > 0
          ? `欠款 ${formatMoney(customer.debtAmount)}`
          : "无欠款";

      return `
        <div class="customer-item">

          <div class="customer-avatar">
            ${getCustomerAvatar(customer.name)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(customer.name)}
            </h4>

            <p>
              ${customer.orderCount}笔订单 ·
              未回桶 ${customer.barrelOwed}个
            </p>

            <p>
              ${escapeHtml(
                customer.address || "暂无地址"
              )}
            </p>

          </div>

          <div class="list-value">

            <strong>
              ${formatMoney(customer.totalAmount)}
            </strong>

            <small
              class="${
                customer.debtAmount > 0
                  ? "debt-value"
                  : ""
              }"
            >
              ${debtText}
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   13. 欠款管理页
   ========================= */

function renderDebtPage() {
  const totalElement =
    document.getElementById("debtPageTotal");

  const container =
    document.getElementById("debtRanking");

  const customers = getCustomerStatistics()
    .filter(customer => customer.debtAmount > 0)
    .sort(
      (a, b) => b.debtAmount - a.debtAmount
    );

  const totalDebt = customers.reduce(
    (sum, customer) =>
      sum + customer.debtAmount,
    0
  );

  if (totalElement) {
    totalElement.textContent =
      formatMoney(totalDebt);
  }

  if (!container) {
    return;
  }

  if (customers.length === 0) {
    container.innerHTML =
      `<div class="empty-state">暂无欠款</div>`;

    return;
  }

  container.innerHTML = customers
    .map((customer, index) => {
      return `
        <div class="debt-item">

          <div class="ranking-number">
            ${index + 1}
          </div>

          <div class="customer-avatar">
            ${getCustomerAvatar(customer.name)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(customer.name)}
            </h4>

            <p>
              累计销售
              ${formatMoney(customer.totalAmount)}
            </p>

          </div>

          <div class="list-value">

            <strong class="debt-value">
              ${formatMoney(customer.debtAmount)}
            </strong>

            <small>
              当前欠款
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   14. 循环桶管理页
   ========================= */

function renderBarrelPage() {
  const customers = getCustomerStatistics()
    .filter(customer => customer.barrelOwed > 0)
    .sort(
      (a, b) => b.barrelOwed - a.barrelOwed
    );

  const barrelOut = orders.reduce(
    (sum, order) => sum + order.barrelOut,
    0
  );

  const barrelBack = orders.reduce(
    (sum, order) => sum + order.barrelBack,
    0
  );

  const barrelOwed = Math.max(
    0,
    barrelOut - barrelBack
  );

  setText(
    "barrelPageOut",
    barrelOut
  );

  setText(
    "barrelPageBack",
    barrelBack
  );

  setText(
    "barrelPageOwed",
    barrelOwed
  );

  const container =
    document.getElementById(
      "barrelCustomerRanking"
    );

  if (!container) {
    return;
  }

  if (customers.length === 0) {
    container.innerHTML =
      `<div class="empty-state">暂无欠桶数据</div>`;

    return;
  }

  container.innerHTML = customers
    .map((customer, index) => {
      return `
        <div class="barrel-ranking-item">

          <div class="ranking-number">
            ${index + 1}
          </div>

          <div class="customer-avatar">
            ${getCustomerAvatar(customer.name)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(customer.name)}
            </h4>

            <p>
              发桶 ${customer.barrelOut} ·
              回桶 ${customer.barrelBack}
            </p>

          </div>

          <div class="list-value">

            <strong class="barrel-value">
              ${customer.barrelOwed}个
            </strong>

            <small>
              未回桶
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   15. 图表数据
   ========================= */

function getLastSevenDaysData() {
  const labels = [];
  const values = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();

    date.setDate(
      date.getDate() - offset
    );

    const key = getDateKey(date);

    const dailyIncome = orders
      .filter(order => getDateKey(order.date) === key)
      .reduce(
        (sum, order) =>
          sum + order.totalAmount,
        0
      );

    labels.push(
      `${date.getMonth() + 1}/${date.getDate()}`
    );

    values.push(dailyIncome);
  }

  return {
    labels,
    values
  };
}


function getProductStatistics() {
  const productMap = new Map();

  orders.forEach(order => {
    order.items.forEach(item => {
      if (
        item.name === "循环桶回桶" ||
        item.quantity <= 0
      ) {
        return;
      }

      const current =
        productMap.get(item.name) || 0;

      productMap.set(
        item.name,
        current + item.quantity
      );
    });
  });

  return Array
    .from(productMap.entries())
    .sort((a, b) => b[1] - a[1]);
}


/* =========================
   16. 首页图表
   ========================= */

function renderHomeCharts() {
  if (
    typeof Chart === "undefined"
  ) {
    console.warn("Chart.js 尚未加载");
    return;
  }

  renderIncomeChart(
    "incomeChart",
    "incomeChart"
  );

  renderProductChart(
    "productChart",
    "productChart"
  );
}


function renderAnalysisCharts() {
  if (
    typeof Chart === "undefined"
  ) {
    return;
  }

  renderIncomeChart(
    "analysisIncomeChart",
    "analysisIncomeChart"
  );

  renderProductChart(
    "analysisProductChart",
    "analysisProductChart"
  );

  renderAnalysisCustomerRanking();
}


function renderIncomeChart(
  canvasId,
  chartVariableName
) {
  const canvas =
    document.getElementById(canvasId);

  if (!canvas) {
    return;
  }

  const data = getLastSevenDaysData();

  destroyChart(chartVariableName);

  const chart = new Chart(
    canvas.getContext("2d"),
    {
      type: "line",

      data: {
        labels: data.labels,

        datasets: [
          {
            label: "营业额",
            data: data.values,

            borderColor: "#1677ff",
            backgroundColor:
              "rgba(22, 119, 255, 0.12)",

            borderWidth: 3,
            fill: true,
            tension: 0.38,

            pointRadius: 4,
            pointHoverRadius: 6,

            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#1677ff",
            pointBorderWidth: 2
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
          intersect: false,
          mode: "index"
        },

        plugins: {
          legend: {
            display: false
          },

          tooltip: {
            callbacks: {
              label: function (context) {
                return formatMoney(
                  context.parsed.y
                );
              }
            }
          }
        },

        scales: {
          x: {
            grid: {
              display: false
            },

            ticks: {
              color: "#8b94a7",
              font: {
                size: 11
              }
            }
          },

          y: {
            beginAtZero: true,

            grid: {
              color:
                "rgba(148, 163, 184, 0.15)"
            },

            ticks: {
              color: "#8b94a7",

              callback: function (value) {
                if (value >= 10000) {
                  return `${value / 10000}万`;
                }

                return value;
              }
            }
          }
        }
      }
    }
  );

  setChartVariable(
    chartVariableName,
    chart
  );
}


function renderProductChart(
  canvasId,
  chartVariableName
) {
  const canvas =
    document.getElementById(canvasId);

  if (!canvas) {
    return;
  }

  let statistics = getProductStatistics();

  if (statistics.length === 0) {
    statistics = [["暂无销量", 1]];
  }

  const labels =
    statistics.map(item => item[0]);

  const values =
    statistics.map(item => item[1]);

  destroyChart(chartVariableName);

  const chart = new Chart(
    canvas.getContext("2d"),
    {
      type: "doughnut",

      data: {
        labels,

        datasets: [
          {
            data: values,

            backgroundColor:
              statistics.length === 1 &&
              statistics[0][0] === "暂无销量"
                ? ["#dfe5ee"]
                : PRODUCT_COLORS,

            borderWidth: 0,
            hoverOffset: 7
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        cutout: "66%",

        plugins: {
          legend: {
            position: "bottom",

            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              boxWidth: 8,
              boxHeight: 8,
              padding: 16,
              color: "#687086",
              font: {
                size: 11
              }
            }
          },

          tooltip: {
            callbacks: {
              label: function (context) {
                if (
                  context.label === "暂无销量"
                ) {
                  return "暂无销量";
                }

                return (
                  `${context.label}：` +
                  `${context.parsed}件`
                );
              }
            }
          }
        }
      }
    }
  );

  setChartVariable(
    chartVariableName,
    chart
  );
}


function destroyChart(variableName) {
  const chart = getChartVariable(variableName);

  if (chart) {
    chart.destroy();
  }
}


function getChartVariable(name) {
  const variables = {
    incomeChart,
    productChart,
    analysisIncomeChart,
    analysisProductChart
  };

  return variables[name];
}


function setChartVariable(name, chart) {
  if (name === "incomeChart") {
    incomeChart = chart;
  }

  if (name === "productChart") {
    productChart = chart;
  }

  if (name === "analysisIncomeChart") {
    analysisIncomeChart = chart;
  }

  if (name === "analysisProductChart") {
    analysisProductChart = chart;
  }
}


/* =========================
   17. 分析页客户排名
   ========================= */

function renderAnalysisCustomerRanking() {
  const container =
    document.getElementById(
      "analysisCustomerRanking"
    );

  if (!container) {
    return;
  }

  const customers = getCustomerStatistics()
    .sort(
      (a, b) => b.totalAmount - a.totalAmount
    )
    .slice(0, 10);

  if (customers.length === 0) {
    container.innerHTML =
      `<div class="empty-state">暂无客户数据</div>`;

    return;
  }

  container.innerHTML = customers
    .map((customer, index) => {
      return `
        <div class="ranking-item">

          <div class="ranking-number">
            ${index + 1}
          </div>

          <div class="customer-avatar">
            ${getCustomerAvatar(customer.name)}
          </div>

          <div class="list-main">

            <h4>
              ${escapeHtml(customer.name)}
            </h4>

            <p>
              ${customer.orderCount}笔订单
            </p>

          </div>

          <div class="list-value">

            <strong>
              ${formatMoney(customer.totalAmount)}
            </strong>

            <small>
              销售金额
            </small>

          </div>

        </div>
      `;
    })
    .join("");
}


/* =========================
   18. 演示数据
   ========================= */

function loadDemoData() {
  const confirmed = window.confirm(
    "加载演示数据会替换老板端当前演示数据，是否继续？"
  );

  if (!confirmed) {
    return;
  }

  const customers = [
    "鑫源超市",
    "阳光幼儿园",
    "人民医院食堂",
    "宏达建筑公司",
    "幸福小区物业",
    "金海大酒店",
    "晨光便利店",
    "蓝天培训学校",
    "腾飞汽修厂",
    "华丰饭店"
  ];

  const products = [
    {
      name: "瓶装水",
      price: 24
    },
    {
      name: "普苏",
      price: 18
    },
    {
      name: "循环桶",
      price: 12
    },
    {
      name: "一次性桶",
      price: 15
    },
    {
      name: "定制水",
      price: 35
    }
  ];

  const demoOrders = [];

  for (let index = 0; index < 38; index++) {
    const date = new Date();

    date.setDate(
      date.getDate() -
      Math.floor(Math.random() * 7)
    );

    date.setHours(
      8 + Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 60),
      0,
      0
    );

    const customerName =
      customers[
        Math.floor(
          Math.random() * customers.length
        )
      ];

    const selectedProducts = [];

    const productCount =
      1 + Math.floor(Math.random() * 3);

    for (
      let productIndex = 0;
      productIndex < productCount;
      productIndex++
    ) {
      const product =
        products[
          Math.floor(
            Math.random() * products.length
          )
        ];

      const alreadyExists =
        selectedProducts.some(
          item => item.name === product.name
        );

      if (alreadyExists) {
        continue;
      }

      const quantity =
        2 + Math.floor(Math.random() * 16);

      selectedProducts.push({
        name: product.name,
        quantity,
        price: product.price,
        amount: quantity * product.price
      });
    }

    const barrelOut =
      selectedProducts
        .filter(
          item => item.name === "循环桶"
        )
        .reduce(
          (sum, item) =>
            sum + item.quantity,
          0
        );

    const barrelBack =
      Math.floor(
        Math.random() *
        (barrelOut + 5)
      );

    if (barrelBack > 0) {
      selectedProducts.push({
        name: "循环桶回桶",
        quantity: barrelBack,
        price: 0,
        amount: 0
      });
    }

    const totalAmount =
      selectedProducts.reduce(
        (sum, item) =>
          sum + item.amount,
        0
      );

    const statusRandom = Math.random();

    let paymentStatus = "paid";
    let paidAmount = totalAmount;

    if (statusRandom < 0.2) {
      paymentStatus = "unpaid";
      paidAmount = 0;
    } else if (statusRandom < 0.35) {
      paymentStatus = "partial";
      paidAmount =
        Math.round(totalAmount * 0.5);
    }

    demoOrders.push({
      id: `DEMO-${index + 1}`,
      customerName,
      phone:
        `138${String(
          10000000 +
          Math.floor(Math.random() * 89999999)
        )}`,
      address:
        `${customerName}收货地址`,
      date: date.toISOString(),
      items: selectedProducts,
      totalAmount,
      paidAmount,
      debtAmount:
        totalAmount - paidAmount,
      paymentStatus,
      barrelOut,
      barrelBack,
      remark: ""
    });
  }

  orders = demoOrders;

  saveOrders();
  renderAll();
  closeMenu();

  alert("演示数据加载成功！");
}


/* =========================
   19. CSV导出
   ========================= */

function exportCSV() {
  if (orders.length === 0) {
    alert("暂无订单数据可以导出。");
    return;
  }

  const header = [
    "订单编号",
    "日期",
    "客户名称",
    "联系电话",
    "地址",
    "产品明细",
    "订单金额",
    "已收金额",
    "欠款金额",
    "付款状态",
    "发桶数量",
    "回桶数量",
    "备注"
  ];

  const rows = orders.map(order => {
    const productText = order.items
      .map(item => {
        return (
          `${item.name}×${item.quantity}` +
          (
            item.price > 0
              ? `（单价${item.price}元）`
              : ""
          )
        );
      })
      .join("；");

    return [
      order.id,
      formatDateTime(order.date),
      order.customerName,
      order.phone,
      order.address,
      productText,
      order.totalAmount.toFixed(2),
      order.paidAmount.toFixed(2),
      order.debtAmount.toFixed(2),
      getStatusInformation(
        order.paymentStatus
      ).text,
      order.barrelOut,
      order.barrelBack,
      order.remark
    ];
  });

  const csvContent = [
    header,
    ...rows
  ]
    .map(row => {
      return row
        .map(value => {
          const safeValue = String(
            value ?? ""
          )
            .replace(/"/g, '""');

          return `"${safeValue}"`;
        })
        .join(",");
    })
    .join("\n");

  const blob = new Blob(
    [
      "\uFEFF",
      csvContent
    ],
    {
      type:
        "text/csv;charset=utf-8;"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `水厂经营数据_${getTodayKey()}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  closeMenu();
}


/* =========================
   20. 辅助函数
   ========================= */

function formatMoney(value) {
  const number = toNumber(value);

  return (
    "¥" +
    number.toLocaleString(
      "zh-CN",
      {
        minimumFractionDigits:
          Number.isInteger(number) ? 0 : 2,

        maximumFractionDigits: 2
      }
    )
  );
}


function setText(elementId, value) {
  const element =
    document.getElementById(elementId);

  if (element) {
    element.textContent = value;
  }
}


function getCustomerAvatar(name) {
  const text =
    String(name || "客户").trim();

  return escapeHtml(
    text.slice(0, 1) || "客"
  );
}


function getProductSummary(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "暂无产品明细";
  }

  return items
    .slice(0, 3)
    .map(
      item =>
        `${item.name}×${item.quantity}`
    )
    .join("、");
}


function getStatusInformation(status) {
  if (status === "paid") {
    return {
      text: "已结清",
      className: "status-paid"
    };
  }

  if (status === "partial") {
    return {
      text: "部分付款",
      className: "status-partial"
    };
  }

  return {
    text: "未付款",
    className: "status-unpaid"
  };
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================
   21. 工人端数据同步
   ========================= */

window.addEventListener(
  "storage",
  function () {
    loadOrders();
    renderAll();
  }
);


/* 页面重新显示时刷新数据 */

document.addEventListener(
  "visibilitychange",
  function () {
    if (
      document.visibilityState === "visible"
    ) {
      loadOrders();
      renderAll();
    }
  }
);
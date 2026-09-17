export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-[#ead9b0] bg-white p-6 shadow-sm text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-[#b5952f] font-semibold">
          Access Denied
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[#102C57]">
          ไม่มีสิทธิ์เข้าถึงหน้านี้
        </h1>
        <p className="mt-3 text-sm text-[#6b7280]">
          กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เพิ่มเติม
        </p>
      </div>
    </div>
  );
}

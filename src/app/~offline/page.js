export const dynamic = "force-static";

export default function OfflineFallbackPage() {
  return (
    <main className="min-h-screen bg-[#102C57] px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col items-center justify-center rounded-[2rem] border border-[#d4af37]/35 bg-white/10 p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#f4c025]">Offline Mode</p>
        <h1 className="mt-4 text-3xl font-bold">ยังไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1>
        <p className="mt-4 text-sm text-white/80">
          หากเครื่องนี้เคยซิงค์ข้อมูลออฟไลน์แล้ว คุณยังสามารถกลับไปใช้หน้าบันทึกงานคิดค่าแรงได้เมื่อเปิด route เดิมจาก wrapper หรือจากเมนูเดิมของระบบ
        </p>
        <p className="mt-3 text-sm text-white/80">
          ถ้าเป็นการเปิดระบบครั้งแรก กรุณาต่ออินเทอร์เน็ตอย่างน้อย 1 ครั้งเพื่อโหลดข้อมูลสินค้าและพนักงานลงเครื่อง
        </p>
      </div>
    </main>
  );
}

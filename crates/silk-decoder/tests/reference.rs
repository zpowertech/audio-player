use silk_decoder::{decode_silk_native, list_packets, Decoder};

const SILK: &[u8] = include_bytes!("../../../test/fixtures/test.slk");
const REFERENCE: &[u8] = include_bytes!("../../../test/fixtures/test_16000.pcm");

#[test]
fn native_and_packet_decoding_match_the_reference() {
    let reference: Vec<i16> = REFERENCE
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]))
        .collect();
    for skip in 0..=2 {
        let (pcm, rate) = decode_silk_native(&SILK[skip..]).unwrap();
        assert_eq!(rate, 16_000);
        assert_eq!(pcm.len(), 80_000);
        assert_eq!(pcm, reference);
    }
    let mut decoder = Decoder::new(0);
    let mut streamed = Vec::new();
    for packet in list_packets(SILK) {
        streamed.extend(decoder.decode_packet(packet).unwrap());
    }
    assert_eq!(streamed, reference);
}

#[test]
fn corrupt_packets_fail() {
    let mut decoder = Decoder::new(0);
    assert!(decoder.decode_packet(&[255; 4]).is_err());
    assert!(Decoder::new(0).decode_packet(&[0; 1025]).is_err());
}
